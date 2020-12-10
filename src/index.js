"use strict";

const express = require("express");
var cors = require('cors')
const qs = require("qs");
const bodyParser = require('body-parser');
const { URL } = require("url");
const contentDisposition = require("content-disposition");
const createRenderer = require("./renderer");

const port = process.env.PORT || 3000;
const app = express();
app.use(cors())
app.use(bodyParser.text({ limit: '10mb' }));

let renderer = null;

// Configure.
app.set("query parser", (s) => qs.parse(s, { allowDots: true }));
app.disable("x-powered-by");

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const htmlCache = {};

function addToCache(key, html) {
  const now = new Date();
  htmlCache[key] = {
    html: html,
    validUntil: now.setTime(now.getTime() + (1 * 60  * 1000))
  };
}

function checkCacheValidity() {
  Object.keys(htmlCache).forEach(key => {
    if (htmlCache[key].validUntil < new Date()) {
      delete htmlCache[key];
    }
  });
}

function getFromCache(key) {
  const found = htmlCache[key];
  if (found) {
    if (found.validUntil < new Date()) {
      delete htmlCache[key];
      return null;
    }
  }
  return found;
}

// Render url.
app.post("/", async (req, res, next) => {
  try {
    // Pridani do cahce
    let { filename, authorization, post, body, ...options } = req.query;
    let html = req.body;
    let uuid = uuidv4();
    addToCache(uuid, html);
    // Samotne vygenerovani PDF
    const urlObj = new URL("http://localhost:" + port + "?key=" + uuid);
    if (!filename) {
      filename = urlObj.hostname;
      if (urlObj.pathname !== "/") {
        filename = urlObj.pathname.split("/").pop();
        if (filename === "") filename = urlObj.pathname.replace(/\//g, "");
        const extDotPosition = filename.lastIndexOf(".");
        if (extDotPosition > 0)
          filename = filename.substring(0, extDotPosition);
      }
    }
    if (!filename.toLowerCase().endsWith(".pdf")) {
      filename += ".pdf";
    }
    const { contentDispositionType, ...pdfOptions } = options;
    const pdf = await renderer.pdf("http://localhost:" + port + "?key=" + uuid, pdfOptions, authorization, post, body);
    delete htmlCache[uuid];
    res
      .set({
        "Content-Type": "application/pdf",
        "Content-Length": pdf.length,
        "Content-Disposition": contentDisposition(filename, {
          type: contentDispositionType || "attachment",
        })
      })
      .send(pdf);
  } catch (e) {
    next(e);
  }
});


app.get("/", (req, res, next) => {
  const key = req.query.key;
  const rep = getFromCache(key);
  if (rep.html) {
    res
      .set({
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": rep.html.length
      })
      .send(rep.html);
  } else {
    res.send("invalid key");
  }

});

// app.use(async (req, res, next) => {
//   let { url, type, filename, authorization, ...options } = req.query;
//   let post = req.method == "POST";
//   let body = req.body;
//   if (!url) {
//     return res
//       .status(400)
//       .send("Search with url parameter. For eaxample, ?url=http://yourdomain");
//   }

//   if (!url.includes("://")) {
//     url = `http://${url}`;
//   }

//   try {
//     switch (type) {
//       case "pdf":
//         const urlObj = new URL(url);
//         if (!filename) {
//           filename = urlObj.hostname;
//           if (urlObj.pathname !== "/") {
//             filename = urlObj.pathname.split("/").pop();
//             if (filename === "") filename = urlObj.pathname.replace(/\//g, "");
//             const extDotPosition = filename.lastIndexOf(".");
//             if (extDotPosition > 0)
//               filename = filename.substring(0, extDotPosition);
//           }
//         }
//         if (!filename.toLowerCase().endsWith(".pdf")) {
//           filename += ".pdf";
//         }
//         const { contentDispositionType, ...pdfOptions } = options;
//         const pdf = await renderer.pdf(url, pdfOptions, authorization, post, body);
//         res
//           .set({
//             "Content-Type": "application/pdf",
//             "Content-Length": pdf.length,
//             "Content-Disposition": contentDisposition(filename, {
//               type: contentDispositionType || "attachment",
//             }),
//           })
//           .send(pdf);
//         break;

//       case "screenshot":
//         const { screenshotType, buffer } = await renderer.screenshot(
//           url,
//           options,
//           authorization,
//           post,
//           body
//         );
//         res
//           .set({
//             "Content-Type": `image/${(screenshotType || 'png')}`,
//             "Content-Length": buffer.length,
//           })
//           .send(buffer);
//         break;

//       default:
//         const html = await renderer.html(url, options, authorization, body);
//         res.status(200).send(html);
//     }
//   } catch (e) {
//     next(e);
//   }
// });

// Error page.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Oops, Somehting went wrong");
});

// Create renderer and start server.
createRenderer({
  ignoreHTTPSErrors: true
})
  .then((createdRenderer) => {
    renderer = createdRenderer;
    console.info("Initialized renderer.");

    app.listen(port, () => {
      console.info(`Listen port on ${port}.`);
    });
  })
  .catch((e) => {
    console.error("Fail to initialze renderer.", e);
  });

setInterval(checkCacheValidity, 10000);


// Terminate process
process.on("SIGINT", () => {
  process.exit(0);
});
