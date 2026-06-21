const fs = require('fs');
const path = require('path');

(async () => {
  try {
    console.log('Loading ZAI SDK...');
    const ZAI = require('@zai-sdk/core');
    console.log('Available ZAI methods:', Object.keys(ZAI));
  } catch (e) {
    console.log('ZAI load error:', e.message);
  }
  
  // Check the worker's VLM logic
  const workerSrc = fs.readFileSync('/home/z/my-project/worker-continuous.js', 'utf8');
  const vlmStart = workerSrc.indexOf('async function handleVLM');
  if (vlmStart > -1) {
    console.log('\nVLM handler found at char:', vlmStart);
    console.log(workerSrc.substring(vlmStart, vlmStart + 500));
  }
})();
