// 呢個 script 用嚟 generate 一個獨立嘅 HTML web app
// 你可以用手機 browser 直接開
const fs = require('fs');
const path = require('path');

// 先 build web version
const { execSync } = require('child_process');
execSync('npx expo export --platform web', { stdio: 'inherit', cwd: __dirname });
