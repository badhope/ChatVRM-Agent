import { createLogger, Logger } from '../services/logger.js';

declare const window: any;
declare const document: any;

export interface BrowserConfig {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
  timeout?: number;
  slowMo?: number;
}

export interface Page {
  url: string;
  title: string;
  content: string;
}

export interface Element {
  selector: string;
  tagName: string;
  text: string;
  attributes: Record<string, string>;
  isVisible: boolean;
  isEnabled: boolean;
}

export interface FormField {
  name: string;
  type: string;
  value: string;
  isRequired: boolean;
  options?: string[];
}

export interface PageAnalysis {
  title: string;
  url: string;
  headings: string[];
  links: Array<{ text: string; href: string }>;
  images: Array<{ alt: string; src: string }>;
  forms: Array<{ action: string; method: string; fields: FormField[] }>;
  scripts: string[];
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  type?: 'png' | 'jpeg';
  quality?: number;
}

export interface FillFormOptions {
  submit?: boolean;
  timeout?: number;
}

export class BrowserAgent {
  private logger: Logger;
  private config: BrowserConfig;
  private browser: any = null;
  private page: any = null;
  private isConnected: boolean = false;

  constructor(config?: BrowserConfig) {
    this.logger = createLogger('BrowserAgent');
    this.config = {
      headless: true,
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      ...config
    };
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      this.logger.warn('Browser already connected');
      return;
    }

    try {
      this.logger.info('Connecting to browser...');
      this.browser = await this.launchBrowser();
      this.page = await this.browser.newPage();
      await this.page.setViewport(this.config.viewport);
      
      if (this.config.userAgent) {
        await this.page.setUserAgent(this.config.userAgent);
      }

      this.isConnected = true;
      this.logger.info('Browser connected successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to connect browser');
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.isConnected = false;
      this.logger.info('Browser disconnected');
    } catch (error) {
      this.logger.error({ error }, 'Error disconnecting browser');
    }
  }

  public async navigate(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<Page> {
    this.ensureConnected();

    try {
      this.logger.info({ url }, 'Navigating to');
      
      const navigationOptions: any = {
        timeout: options?.timeout || this.config.timeout,
        waitUntil: options?.waitUntil || 'networkidle2'
      };

      await this.page.goto(url, navigationOptions);

      const result: Page = {
        url: this.page.url(),
        title: await this.page.title(),
        content: await this.page.content()
      };

      this.logger.info({ url: result.url, title: result.title }, 'Navigation successful');
      return result;
    } catch (error) {
      this.logger.error({ url, error }, 'Navigation failed');
      throw error;
    }
  }

  public async click(selector: string, options?: { timeout?: number; force?: boolean }): Promise<void> {
    this.ensureConnected();

    try {
      this.logger.debug({ selector }, 'Clicking element');
      
      const clickOptions: any = {
        timeout: options?.timeout || this.config.timeout,
        force: options?.force || false
      };

      await this.page.click(selector, clickOptions);
      this.logger.debug({ selector }, 'Click successful');
    } catch (error) {
      this.logger.error({ selector, error }, 'Click failed');
      throw error;
    }
  }

  public async fill(selector: string, value: string, options?: { timeout?: number; force?: boolean }): Promise<void> {
    this.ensureConnected();

    try {
      this.logger.debug({ selector, value }, 'Filling field');
      
      const fillOptions: any = {
        timeout: options?.timeout || this.config.timeout,
        force: options?.force || false
      };

      await this.page.fill(selector, value, fillOptions);
      this.logger.debug({ selector }, 'Fill successful');
    } catch (error) {
      this.logger.error({ selector, error }, 'Fill failed');
      throw error;
    }
  }

  public async selectOption(selector: string, value: string | string[], options?: { timeout?: number }): Promise<void> {
    this.ensureConnected();

    try {
      this.logger.debug({ selector, value }, 'Selecting option');
      
      const selectOptions: any = {
        timeout: options?.timeout || this.config.timeout
      };

      await this.page.selectOption(selector, value, selectOptions);
      this.logger.debug({ selector }, 'Select successful');
    } catch (error) {
      this.logger.error({ selector, error }, 'Select failed');
      throw error;
    }
  }

  public async type(selector: string, text: string, options?: { delay?: number; timeout?: number }): Promise<void> {
    this.ensureConnected();

    try {
      this.logger.debug({ selector, textLength: text.length }, 'Typing text');
      
      const typeOptions: any = {
        delay: options?.delay || 0,
        timeout: options?.timeout || this.config.timeout
      };

      await this.page.type(selector, text, typeOptions);
      this.logger.debug({ selector }, 'Type successful');
    } catch (error) {
      this.logger.error({ selector, error }, 'Type failed');
      throw error;
    }
  }

  public async press(key: string, options?: { modifiers?: number; timeout?: number }): Promise<void> {
    this.ensureConnected();

    try {
      this.logger.debug({ key }, 'Pressing key');
      
      const pressOptions: any = {
        timeout: options?.timeout || this.config.timeout
      };

      if (options?.modifiers) {
        pressOptions.modifiers = options.modifiers;
      }

      await this.page.keyboard.press(key, pressOptions);
      this.logger.debug({ key }, 'Press successful');
    } catch (error) {
      this.logger.error({ key, error }, 'Press failed');
      throw error;
    }
  }

  public async hover(selector: string, options?: { timeout?: number }): Promise<void> {
    this.ensureConnected();

    try {
      this.logger.debug({ selector }, 'Hovering over element');
      
      const hoverOptions: any = {
        timeout: options?.timeout || this.config.timeout
      };

      await this.page.hover(selector, hoverOptions);
      this.logger.debug({ selector }, 'Hover successful');
    } catch (error) {
      this.logger.error({ selector, error }, 'Hover failed');
      throw error;
    }
  }

  public async scroll(x: number, y: number): Promise<void> {
    this.ensureConnected();

    try {
      await this.page!.evaluate(([scrollX, scrollY]: [number, number]) => {
        (globalThis as any).scrollTo(scrollX, scrollY);
      }, [x, y]);
      
      this.logger.debug({ x, y }, 'Scroll successful');
    } catch (error) {
      this.logger.error({ error }, 'Scroll failed');
      throw error;
    }
  }

  public async screenshot(options?: ScreenshotOptions): Promise<Buffer> {
    this.ensureConnected();

    try {
      this.logger.debug('Taking screenshot');

      const screenshotOptions: any = {};
      
      if (options?.fullPage !== undefined) {
        screenshotOptions.fullPage = options.fullPage;
      }
      
      if (options?.clip) {
        screenshotOptions.clip = options.clip;
      }
      
      if (options?.type) {
        screenshotOptions.type = options.type;
      }
      
      if (options?.quality) {
        screenshotOptions.quality = options.quality;
      }

      const screenshot = await this.page.screenshot(screenshotOptions);
      this.logger.debug({ size: screenshot.length }, 'Screenshot taken');
      
      return screenshot;
    } catch (error) {
      this.logger.error({ error }, 'Screenshot failed');
      throw error;
    }
  }

  public async evaluate(script: string): Promise<any> {
    this.ensureConnected();

    try {
      this.logger.debug({ scriptLength: script.length }, 'Evaluating script');
      const result = await this.page.evaluate(script);
      this.logger.debug('Evaluation successful');
      return result;
    } catch (error) {
      this.logger.error({ error }, 'Evaluation failed');
      throw error;
    }
  }

  public async waitForSelector(selector: string, options?: { timeout?: number; state?: 'visible' | 'hidden' | 'attached' | 'detached' }): Promise<void> {
    this.ensureConnected();

    try {
      this.logger.debug({ selector }, 'Waiting for selector');
      
      const waitOptions: any = {
        timeout: options?.timeout || this.config.timeout,
        state: options?.state || 'visible'
      };

      await this.page.waitForSelector(selector, waitOptions);
      this.logger.debug({ selector }, 'Selector found');
    } catch (error) {
      this.logger.error({ selector, error }, 'Wait for selector failed');
      throw error;
    }
  }

  public async waitForNavigation(options?: { timeout?: number; waitUntil?: string }): Promise<void> {
    this.ensureConnected();

    try {
      const navOptions: any = {
        timeout: options?.timeout || this.config.timeout,
        waitUntil: options?.waitUntil || 'networkidle2'
      };

      await this.page.waitForNavigation(navOptions);
      this.logger.debug('Navigation complete');
    } catch (error) {
      this.logger.error({ error }, 'Wait for navigation failed');
      throw error;
    }
  }

  public async waitForTimeout(milliseconds: number): Promise<void> {
    this.ensureConnected();

    try {
      await this.page.waitForTimeout(milliseconds);
      this.logger.debug({ milliseconds }, 'Timeout waited');
    } catch (error) {
      this.logger.error({ error }, 'Wait timeout failed');
      throw error;
    }
  }

  public async getElement(selector: string): Promise<Element | null> {
    this.ensureConnected();

    try {
      const element = await this.page.$(selector);
      
      if (!element) {
        return null;
      }

      const tagName = await element.evaluate((el: any) => el.tagName.toLowerCase());
      const text = await element.evaluate((el: any) => el.textContent?.trim() || '');
      const isVisible = await element.isVisible();
      const isEnabled = await element.isEnabled();

      const attributes: Record<string, string> = {};
      const attrs = await element.evaluate((el: any) => {
        const attrs: any = el.attributes;
        const result: Record<string, string> = {};
        for (let i = 0; i < attrs.length; i++) {
          result[attrs[i].name] = attrs[i].value;
        }
        return result;
      });

      return {
        selector,
        tagName,
        text,
        attributes: attrs,
        isVisible,
        isEnabled
      };
    } catch (error) {
      this.logger.error({ selector, error }, 'Get element failed');
      throw error;
    }
  }

  public async getElements(selector: string): Promise<Element[]> {
    this.ensureConnected();

    try {
      const elements = await this.page.$$(selector);
      const results: Element[] = [];

      for (const element of elements) {
        const tagName = await element.evaluate((el: any) => el.tagName.toLowerCase());
        const text = await element.evaluate((el: any) => el.textContent?.trim() || '');
        const isVisible = await element.isVisible();
        const isEnabled = await element.isEnabled();

        results.push({
          selector,
          tagName,
          text,
          attributes: {},
          isVisible,
          isEnabled
        });
      }

      return results;
    } catch (error) {
      this.logger.error({ selector, error }, 'Get elements failed');
      throw error;
    }
  }

  public async analyzePage(): Promise<PageAnalysis> {
    this.ensureConnected();

    try {
      this.logger.debug('Analyzing page');

      const analysis = await (this.page as any).evaluate(() => {
        const getText = (el: any) => el.textContent?.trim() || '';
        
        const headings: string[] = [];
        for (let i = 1; i <= 6; i++) {
          const els = (window as any).document.querySelectorAll(`h${i}`);
          els.forEach((el: any) => headings.push(getText(el)));
        }

        const links: Array<{ text: string; href: string }> = [];
        const linkEls = (window as any).document.querySelectorAll('a');
        linkEls.forEach((el: any) => {
          const href = el.href;
          const text = getText(el);
          if (href && text) {
            links.push({ text, href });
          }
        });

        const images: Array<{ alt: string; src: string }> = [];
        const imgEls = (window as any).document.querySelectorAll('img');
        imgEls.forEach((el: any) => {
          const alt = el.alt;
          const src = el.src;
          if (src) {
            images.push({ alt, src });
          }
        });

        const forms: Array<{ action: string; method: string; fields: any[] }> = [];
        const formEls = (window as any).document.querySelectorAll('form');
        formEls.forEach((form: any) => {
          const action = form.action;
          const method = form.method;
          const fields: any[] = [];
          
          const inputs = form.querySelectorAll('input, select, textarea');
          inputs.forEach((input: any) => {
            const name = input.name;
            const type = input.type;
            const value = input.value;
            const required = input.required;
            
            fields.push({ name, type, value, isRequired: required });
          });

          forms.push({ action, method, fields });
        });

        const scripts: string[] = [];
        const scriptEls = (window as any).document.querySelectorAll('script[src]');
        scriptEls.forEach((el: any) => {
          const src = el.src;
          if (src) {
            scripts.push(src);
          }
        });

        return {
          title: (window as any).document.title,
          url: (window as any).location.href,
          headings,
          links,
          images,
          forms,
          scripts
        };
      });

      this.logger.debug('Page analysis complete');
      return analysis;
    } catch (error) {
      this.logger.error({ error }, 'Page analysis failed');
      throw error;
    }
  }

  public async fillForm(formSelector: string, data: Record<string, string>, options?: FillFormOptions): Promise<void> {
    this.ensureConnected();

    try {
      this.logger.info({ formSelector, fieldCount: Object.keys(data).length }, 'Filling form');

      const form = await this.page.$(formSelector);
      if (!form) {
        throw new Error(`Form not found: ${formSelector}`);
      }

      for (const [name, value] of Object.entries(data)) {
        const selector = `${formSelector} [name="${name}"]`;
        const element = await this.page.$(selector);
        
        if (!element) {
          this.logger.warn({ name }, 'Form field not found');
          continue;
        }

        const tagName = await element.evaluate((el: any) => el.tagName.toLowerCase());
        
        if (tagName === 'select') {
          await this.selectOption(selector, value);
        } else if (tagName === 'input') {
          const type = await element.evaluate((el: any) => el.type);
          
          if (type === 'checkbox' || type === 'radio') {
            if (value === 'true' || value === '1') {
              await element.check();
            } else {
              await element.uncheck();
            }
          } else {
            await this.fill(selector, value);
          }
        } else if (tagName === 'textarea') {
          await this.fill(selector, value);
        }
      }

      if (options?.submit) {
        const submitSelector = `${formSelector} button[type="submit"], ${formSelector} input[type="submit"]`;
        const submitBtn = await this.page.$(submitSelector);
        
        if (submitBtn) {
          await submitBtn.click();
          
          if (options.timeout) {
            await this.waitForNavigation({ timeout: options.timeout });
          }
        }
      }

      this.logger.info('Form filled successfully');
    } catch (error) {
      this.logger.error({ formSelector, error }, 'Fill form failed');
      throw error;
    }
  }

  public async extractLinks(urlPattern?: RegExp): Promise<Array<{ text: string; href: string }>> {
    this.ensureConnected();

    try {
      const links = await (this.page as any).evaluate((pattern: string | null) => {
        const linkEls = (window as any).document.querySelectorAll('a');
        const results: Array<{ text: string; href: string }> = [];
        
        linkEls.forEach((el: any) => {
          const href = el.href;
          const text = el.textContent?.trim() || '';
          
          if (href) {
            if (pattern && !new RegExp(pattern).test(href)) {
              return;
            }
            results.push({ text, href });
          }
        });
        
        return results;
      }, urlPattern ? urlPattern.source : null);

      this.logger.debug({ count: links.length }, 'Links extracted');
      return links;
    } catch (error) {
      this.logger.error({ error }, 'Extract links failed');
      throw error;
    }
  }

  public async downloadFile(selector: string, downloadPath?: string): Promise<string> {
    this.ensureConnected();

    try {
      this.logger.info({ selector }, 'Downloading file');

      const [download] = await Promise.all([
        this.page.waitForEvent('download', { timeout: this.config.timeout }),
        this.click(selector)
      ]);

      const path = downloadPath || download.suggestedFilename();
      await download.saveAs(path);

      this.logger.info({ path }, 'File downloaded');
      return path;
    } catch (error) {
      this.logger.error({ selector, error }, 'Download failed');
      throw error;
    }
  }

  public async uploadFile(selector: string, filePath: string): Promise<void> {
    this.ensureConnected();

    try {
      this.logger.info({ selector, filePath }, 'Uploading file');
      await this.page.setInputFiles(selector, filePath);
      this.logger.info('File uploaded successfully');
    } catch (error) {
      this.logger.error({ selector, filePath, error }, 'Upload failed');
      throw error;
    }
  }

  public async getCookies(): Promise<Array<{ name: string; value: string; domain: string; path: string }>> {
    this.ensureConnected();

    try {
      const cookies = await this.page.context().cookies();
      return cookies.map((c: any) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path
      }));
    } catch (error) {
      this.logger.error({ error }, 'Get cookies failed');
      throw error;
    }
  }

  public async setCookies(cookies: Array<{ name: string; value: string; domain: string; path?: string }>): Promise<void> {
    this.ensureConnected();

    try {
      await this.page.context().addCookies(cookies);
      this.logger.debug({ count: cookies.length }, 'Cookies set');
    } catch (error) {
      this.logger.error({ error }, 'Set cookies failed');
      throw error;
    }
  }

  public async clearCookies(): Promise<void> {
    this.ensureConnected();

    try {
      await this.page.context().clearCookies();
      this.logger.debug('Cookies cleared');
    } catch (error) {
      this.logger.error({ error }, 'Clear cookies failed');
      throw error;
    }
  }

  public async setExtraHTTPHeaders(headers: Record<string, string>): Promise<void> {
    this.ensureConnected();

    try {
      await this.page.setExtraHTTPHeaders(headers);
      this.logger.debug({ count: Object.keys(headers).length }, 'Extra headers set');
    } catch (error) {
      this.logger.error({ error }, 'Set extra headers failed');
      throw error;
    }
  }

  public async authenticate(username: string, password: string): Promise<void> {
    this.ensureConnected();

    try {
      await this.page.authenticate({ username, password });
      this.logger.debug('Authentication set');
    } catch (error) {
      this.logger.error({ error }, 'Authentication failed');
      throw error;
    }
  }

  public async reload(options?: { timeout?: number; waitUntil?: string }): Promise<Page> {
    this.ensureConnected();

    try {
      this.logger.info('Reloading page');
      
      const navOptions: any = {
        timeout: options?.timeout || this.config.timeout,
        waitUntil: options?.waitUntil || 'networkidle2'
      };

      await this.page.reload(navOptions);

      const result: Page = {
        url: this.page.url(),
        title: await this.page.title(),
        content: await this.page.content()
      };

      this.logger.info('Page reloaded');
      return result;
    } catch (error) {
      this.logger.error({ error }, 'Reload failed');
      throw error;
    }
  }

  public async goBack(): Promise<Page> {
    this.ensureConnected();

    try {
      await this.page.goBack();
      await this.page.waitForLoadState('networkidle');
      
      const result: Page = {
        url: this.page.url(),
        title: await this.page.title(),
        content: await this.page.content()
      };

      this.logger.info({ url: result.url }, 'Navigated back');
      return result;
    } catch (error) {
      this.logger.error({ error }, 'Go back failed');
      throw error;
    }
  }

  public async goForward(): Promise<Page> {
    this.ensureConnected();

    try {
      await this.page.goForward();
      await this.page.waitForLoadState('networkidle');
      
      const result: Page = {
        url: this.page.url(),
        title: await this.page.title(),
        content: await this.page.content()
      };

      this.logger.info({ url: result.url }, 'Navigated forward');
      return result;
    } catch (error) {
      this.logger.error({ error }, 'Go forward failed');
      throw error;
    }
  }

  private async launchBrowser(): Promise<any> {
    try {
      const playwright: any = await import('playwright' as any);
      const browser = await playwright.chromium.launch({
        headless: this.config.headless,
        slowMo: this.config.slowMo
      });
      return browser;
    } catch (error) {
      this.logger.error({ error }, 'Failed to launch browser');
      throw new Error('Playwright is not installed. Please run: npm install playwright && npx playwright install chromium');
    }
  }

  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new Error('Browser is not connected. Call connect() first.');
    }
  }
}

export default BrowserAgent;
