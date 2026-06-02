import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printHeader, printSuccess, printError, printWarning, printInfo, printStep } from '../../../cli/ui/display.js';
import { printLogo, asciiLogo } from '../../../cli/ui/logo.js';

describe('printHeader', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should output header text', () => {
    printHeader();

    const allCalls = consoleSpy.mock.calls.map((call) => call[0]).join(' ');
    expect(allCalls).toContain('Personal-Assistant Agent CLI');
  });

  it('should include v2.0 text', () => {
    printHeader();

    const allCalls = consoleSpy.mock.calls.map((call) => call[0]).join(' ');
    expect(allCalls).toContain('v2.0');
  });
});

describe('printSuccess', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should include the message text', () => {
    printSuccess('Task completed');

    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain('Task completed');
  });

  it('should handle empty message', () => {
    printSuccess('');

    expect(consoleSpy).toHaveBeenCalled();
  });
});

describe('printError', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should include the message text', () => {
    printError('Something went wrong');

    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain('Something went wrong');
  });

  it('should handle empty message', () => {
    printError('');

    expect(consoleSpy).toHaveBeenCalled();
  });
});

describe('printWarning', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should include the message text', () => {
    printWarning('Deprecated API');

    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain('Deprecated API');
  });

  it('should handle special characters', () => {
    printWarning('Path: /usr/local/bin & ~/.config');

    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain('/usr/local/bin');
    expect(output).toContain('~/.config');
  });
});

describe('printInfo', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should include the message text', () => {
    printInfo('Connecting to provider');

    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain('Connecting to provider');
  });

  it('should handle very long messages', () => {
    const longMessage = 'A'.repeat(1000);

    printInfo(longMessage);

    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain(longMessage);
  });
});

describe('printStep', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should include the message text', () => {
    printStep('Installing dependencies');

    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain('Installing dependencies');
  });
});

describe('printLogo', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should output ASCII art', () => {
    printLogo();

    const allCalls = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(allCalls).toContain('██████');
  });

  it('should output version text', () => {
    printLogo();

    const allCalls = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(allCalls).toContain('v2.0');
  });
});

describe('asciiLogo', () => {
  it('should contain PERSONAL text', () => {
    expect(asciiLogo).toContain('Personal');
  });

  it('should contain v2.0', () => {
    expect(asciiLogo).toContain('v2.0');
  });
});