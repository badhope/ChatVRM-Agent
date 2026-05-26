#!/usr/bin/env node
/**
 * Language Switching Demo
 * Demonstrates the i18n system and settings UI
 */

import { showSettingsMenu } from '../src/ui/settings-menu.js';

async function main() {
  console.log('🚀 Personal Assistant - Language Settings Demo');
  console.log('='.repeat(50));
  console.log('');

  try {
    await showSettingsMenu();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
