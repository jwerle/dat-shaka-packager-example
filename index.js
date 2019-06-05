const hyperdrive = require('hyperdrive')
const storage = require('dat-storage')
const swarm = require('discovery-swarm')
const path = require('path')
const ram = require('random-access-memory')

const dirname = './input'
const key = '66dea7bef181330e5454c6a4cb7b848d838631ebb9e1bcd73b1bafb78bf51ae2'

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

function connect(key, dirname, callback) {
  const opts = require('dat-swarm-defaults')({ hash: false, stream: onstream })
  const input = hyperdrive(storage(dirname), { latest: true })
  const request = hyperdrive(ram, key, { latest: true })
  const discovery = swarm(opts)

  input.ready(() => request.ready(onready))

  discovery.on('error', callback)
  request.on('error', callback)
  input.on('error', callback)

  function onready() {
    discovery.join(request.discoveryKey)
  }

  function onstream() {
    const stream = request.replicate({ live: true, userData: input.key })
    stream.on('handshake', onhandshake)
    stream.on('error', callback)
    return stream

    function onhandshake() {
      const key = stream.remoteUserData.toString('hex')
      const output = path.join(`./tmp/${key}`)
      const response = hyperdrive(storage(output), key, { latest: true })

      response.replicate({ stream, live: true })
      input.replicate({ stream, live: true })

      response.on('error', callback)
      response.on('sync', onsync)

      function onsync() {
        stream.destroy()
        discovery.close()
        callback(null, response)
      }
    }
  }
}
