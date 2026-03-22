import { loadServerConfig } from './config'
import { createApp } from './app'

const config = loadServerConfig()
const app = await createApp()

app.listen(config.port, () => {
  console.log(`OpenClaw AgentOps server listening on ${config.port}`)
})
