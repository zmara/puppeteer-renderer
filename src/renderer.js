"use strict";

const puppeteer = require("puppeteer");
const waitForAnimations = require("./wait-for-animations");
const PDFDocument =  require("pdf-lib");


class Renderer {
  constructor(browser) {
    this.browser = browser;
  }

  async html(url, options = {}, authorization = "", post = true, body = "") {
    let page = null;
    try {
      const { timeout, waitUntil, credentials } = options;
      page = await this.createPage(
        url,
        { timeout, waitUntil, credentials },
        authorization,
        post,
        body
      );
      const html = await page.content();
      return html;
    } finally {
      this.closePage(page);
    }
  }

  async pdf(url, options = {}, authorization = "", post = true, body = "") {
    let page = null;
    try {
      const {
        timeout,
        waitUntil,
        credentials,
        emulateMediaType,
        ...extraOptions
      } = options;
      page = await this.createPage(
        url,
        {
          timeout,
          waitUntil,
          credentials,
          emulateMediaType: emulateMediaType || "print",
        },
        authorization,
        post,
        body
      );

      const {
        scale = 1.0,
        displayHeaderFooter,
        printBackground,
        landscape
      } = extraOptions;
      const footerTemplate = body.footerTemplate;
      const footerFirstMarginBottom = body.footerFirstMarginBottom;
      const footerOtherMarginBottom = body.footerOtherMarginBottom;
      
      if (footerTemplate != null) {
        const pdf1 = await page.pdf({
          ...extraOptions,
          scale: Number(scale),
          displayHeaderFooter: true,
          printBackground: printBackground === "true",
          landscape: landscape === "true",
          pageRanges: '1',  // start this PDF at page 2
          footerTemplate: footerTemplate,
          margin: { bottom: footerFirstMarginBottom != null ? footerFirstMarginBottom : '35px' },
        });

        let pdf2;
        try {
          pdf2 = await page.pdf({
            ...extraOptions,
            scale: Number(scale),
            printBackground: printBackground === "true",
            landscape: landscape === "true",
            displayHeaderFooter: true,
            pageRanges: '2-', // start this PDF at page 2
            footerTemplate: footerTemplate,
            margin: { bottom: footerOtherMarginBottom != null ? footerOtherMarginBottom : '78px' },
          });
        } catch (ex) {
          return pdf1;
        }
  
        return this.mergePdfs(pdf1, pdf2);
      } else {
        const buffer = await page.pdf({
          ...extraOptions,
          scale: Number(scale),
          displayHeaderFooter: displayHeaderFooter === "true",
          printBackground: printBackground === "true",
          landscape: landscape === "true",
        });
        return buffer;
      }
    } finally {
      this.closePage(page);
    }
  }

  async mergePdfs(pdf1, pdf2) {
    const pdfDoc = await PDFDocument.PDFDocument.create()

    const coverDoc = await PDFDocument.PDFDocument.load(pdf1)
    const [coverPage] = await pdfDoc.copyPages(coverDoc, [0])
    pdfDoc.addPage(coverPage)

    const mainDoc = await PDFDocument.PDFDocument.load(pdf2)
    for (let i = 0; i < mainDoc.getPageCount(); i++) {
        const [aMainPage] = await pdfDoc.copyPages(mainDoc, [i])
        pdfDoc.addPage(aMainPage)
    }

    const pdfBytes = await pdfDoc.save()

    return Buffer.from(pdfBytes);
  }

  async screenshot(url, options = {}, authorization = "", post = true, body = "") {
    let page = null;
    try {
      const { timeout, waitUntil, credentials, ...extraOptions } = options;
      page = await this.createPage(
        url,
        { timeout, waitUntil, credentials },
        authorization,
        post,
        body
      );
      page.setViewport({
        width: Number(extraOptions.width || 800),
        height: Number(extraOptions.height || 600),
      });

      const {
        fullPage,
        omitBackground,
        screenshotType,
        quality,
        ...restOptions
      } = extraOptions;
      let screenshotOptions = {
        ...restOptions,
        type: screenshotType || "png",
        quality:
          Number(quality) ||
          (screenshotType === undefined || screenshotType === "png" ? 0 : 100),
        fullPage: fullPage === "true",
        omitBackground: omitBackground === "true",
      };

      const animationTimeout = Number(options.animationTimeout || 0);
      if (animationTimeout > 0) {
        await waitForAnimations(page, screenshotOptions, animationTimeout);
      }

      const buffer = await page.screenshot(screenshotOptions);
      return {
        screenshotType,
        buffer,
      };
    } finally {
      this.closePage(page);
    }
  }



  async createPage(url, options = {}, authorization = "", post = false, postData = "") {
    const { timeout, waitUntil, credentials, emulateMediaType } = options;
    const page = await this.browser.newPage();

    page.on("error", async (error) => {
      console.error(error);
      await this.closePage(page);
    });

    page.setRequestInterception(true);

    page.on("request", (request) => {
      const headers = request.headers();
      const overrides = { headers: headers };
      if (post == true && request.resourceType() == "document") {
        overrides.method = "POST";
        overrides.postData = JSON.stringify(postData);
        headers["Content-Type"] =  "application/json"
      }
      if (authorization != "") {
        headers["Authorization"] = authorization;
      }
      request.continue(overrides);
    });

    if (emulateMediaType) {
      await page.emulateMediaType(emulateMediaType);
    }

    if (credentials) {
      await page.authenticate(credentials);
    }

    await page.goto(url, {
      timeout: Number(timeout) || 30 * 1000,
      waitUntil: waitUntil || "networkidle2",
    });
    return page;
  }

  async closePage(page) {
    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
    } catch (e) {}
  }

  async close() {
    await this.browser.close();
  }
}

async function create(options = {}) {
  const browser = await puppeteer.launch(
    Object.assign({ args: ["--no-sandbox"] }, options)
  );
  return new Renderer(browser);
}

module.exports = create;
