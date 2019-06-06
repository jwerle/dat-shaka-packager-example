const hyperdrive = require('hyperdrive')
const protocol = require('hypercore-protocol')
const storage = require('dat-storage')
const crypto = require('hypercore-crypto')
const rimraf = require('rimraf')
const swarm = require('discovery-swarm')
const path = require('path')
const ram = require('random-access-memory')

const TIMEOUT = 60000
const dirname = './input'
const key = '3546e77a133f01721058fb96cd9034d2cbf1e665eb040455e6eec614a8206bb7'

function connect(key, dirname, callback) {
  const opts = require('dat-swarm-defaults')({ hash: false, stream: onstream })
  const input = hyperdrive(storage(dirname), { latest: true })
  const discovery = swarm(opts)
  const discoveryKey = crypto.discoveryKey(Buffer.from(key, 'hex'))

  let connected = false
  let retries = 3

  input.ready(onready)

  discovery.on('error', onerror)
  input.on('error', onerror)

  function onerror(err) {
    connected = false
    if (0 === --retries) {
      callback(err)
    }
  }

  function onready() {
    discovery.join(discoveryKey)
  }

  function onstream() {
    const stream = protocol({ live: true, userData: input.key })
    stream.feed(Buffer.from(key, 'hex'))
    stream.once('handshake', onhandshake)
    stream.once('error', callback)
    return stream

    function onhandshake() {
      if (connected) {
        return stream.finalize()
      }

      connected = true
      const key = stream.remoteUserData.toString('hex')
      const output = path.join(`./tmp/${key}`)
      const response = hyperdrive(storage(output), key, { latest: true })

      let timeout = setTimeout(ontimeout, TIMEOUT)

      response.replicate({ stream, live: true })
      input.replicate({ stream, live: true })

      response.on('error', callback)
      response.on('sync', onsync)
      response.on('update', () => {
        clearTimeout(timeout)
        timeout = setTimeout(ontimeout, TIMEOUT)
      })

      response.once('content', () => {
        response.content.on('download', (info) => {
          console.log('download:',
            response.content.stats.totals.downloadedBytes / response.content.byteLength)
          clearTimeout(timeout)
          timeout = setTimeout(ontimeout, TIMEOUT)
        })
      })
      input.content.on('upload', (info) => {
        console.log('upload:', info)
        clearTimeout(timeout)
        timeout = setTimeout(ontimeout, TIMEOUT)
      })

      function onsync() {
        console.log('sync')
        clearTimeout(ontimeout)
        stream.finalize()
        discovery.close()
        response.readFile('error.json', (err, buf) => {
          if (err) {
            callback(null, response)
          } else {
            callback(Object.assign(new Error(), JSON.parse(buf)), null)
          }
        })
      }

      function ontimeout() {
        console.log('timeout: retries=%d', retries)
        retries--
        connected = false
        stream.finalize()
        rimraf(output, (err) => err && console.error(err))
      }
    }
  }
}

connect(key, dirname, (err, res) => {
  if (err) {
    console.error('ERR', err.message)
    return process.exit(1)
  }

  console.log('packaged %s at %s', dirname, key)
  res.readdir('/', (err, files) => {
    if (err) {
      console.error('ERR', err.message)
      return process.exit(1)
    }

    console.log(files)
    process.nextTick(process.exit, 0)
  })
})
