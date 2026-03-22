import express from 'express'

const app = express()
const port = Number(process.env.PORT ?? 3000)

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.listen(port, () => {
  console.log(`OpenClaw AgentOps server listening on ${port}`)
})
