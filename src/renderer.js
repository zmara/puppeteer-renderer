"use strict";

const puppeteer = require("puppeteer");
const waitForAnimations = require("./wait-for-animations");



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
        landscape,
      } = extraOptions;
      const buffer = await page.pdf({
        ...extraOptions,
        scale: Number(scale),
        displayHeaderFooter: displayHeaderFooter === "true",
        printBackground: printBackground === "true",
        landscape: landscape === "true",
      });
      return buffer;
    } finally {
      this.closePage(page);
    }
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
