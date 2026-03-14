const express = require("express")
const { spawn } = require("child_process")
const { sendNotification } = require('my-little-home-server')

const app = express()
app.use(express.json())

let queue = []
let history = []
let jobs = {}
let active = null

function urlToId(url) {
  return Buffer.from(url).toString("base64url")
}

function idToUrl(id) {
  return Buffer.from(id, "base64url").toString()
}


function downloadVideo(url) {

  return new Promise((resolve, reject) => {

    // Step 1: get JSON metadata including thumbnail
    const meta = spawn("yt-dlp", ["-j", url])

    let jsonData = ""
    meta.stdout.on("data", d => jsonData += d.toString())
    meta.stderr.on("data", d => console.error(d.toString()))

    meta.on("close", code => {
      if (code !== 0) return reject({status:"failed", code})

      try {
        const info = JSON.parse(jsonData)
        const thumbnail = info.thumbnail

        // Step 2: download video
        const dl = spawn("yt-dlp", [url])

        dl.stdout.on("data", d => console.log(d.toString()))
        dl.stderr.on("data", d => console.log(d.toString()))

        dl.on("close", code => {
          if (code === 0)
          

          
            resolve({status:"finished", url, thumbnail, title: info.title})
          else
            reject({status:"failed", code})
        })

      } catch(err) {
        reject({status:"failed", error: err.message})
      }
    })

  })

}

function runNext() {

  if (active || queue.length === 0) return

  const url = queue.shift().url

  const proc = spawn("yt-dlp", [url])

  active = {
    url,
    progress: "starting"
  }

  proc.stdout.on("data", d => {
    const line = d.toString()

    if (line.includes("%")) {
      active.progress = line.trim()
    }

    console.log(line)
  })

  proc.stderr.on("data", d => console.log(d.toString()))

  proc.on("close", () => {
    history.unshift(active)
    active = null
    runNext()
  })
}

app.post("/yt", async (req, res) => {

  let url = req.body
  if (typeof req.body === "object" && req.body.url)
    url = req.body.url

  if (typeof url !== "string")
    return res.status(400).json({error: "invalid url"})

  console.log("Downloading:", url);

  try {
    const result = await downloadVideo(url)
    res.json(result)
              
	// After yt-dlp finishes:
	await sendNotification({
	  title:    'Download complete',
	  body:     result.title,
	  imageUrl: result.thumbnail,
	})
          
  } catch (err) {
    res.status(500).json(err)
    	// After yt-dlp finishes:
	await sendNotification({
	  title:    'Download error',
	  body:     err,
	})

  }

})

app.get("/", (req, res) => {

  res.send(`
  <h2>yt-dlp Server</h2>

  <b>Active</b><br>
  ${active ? active.url + "<br>" + active.progress : "none"}

  <br><br>

  <b>Queue</b><br>
  ${queue.join("<br>")}

  <br><br>

  <b>Recent</b><br>
  ${history.slice(0,5).map(h=>h.url).join("<br>")}
  `)
})

app.listen(9000, () =>
  console.log("ytshare running on 9000")
)