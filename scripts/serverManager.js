const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '../SpigotServer');
const LOG_DIR = path.join(__dirname, '../logs/server');
const STATUS_FILE = path.join(__dirname, '../status.json');

// التأكد من وجود مجلد السجلات وملف الحالة
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}
if (!fs.existsSync(STATUS_FILE)) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify({ server_status: 'stopped', ngrok_url: '' }, null, 2));
}

let serverProcess = null;

function updateStatus(newStatus, ngrokUrl = '') {
  const status = JSON.parse(fs.readFileSync(STATUS_FILE));
  status.server_status = newStatus;
  status.ngrok_url = ngrokUrl;
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  console.log(`Updated status to: ${newStatus}, ngrok_url: ${ngrokUrl}`);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const status = JSON.parse(fs.readFileSync(STATUS_FILE));
    if (status.server_status === 'running') {
      return reject(new Error('الخادوم يعمل بالفعل!'));
    }

    const logStream = fs.createWriteStream(
      path.join(LOG_DIR, `server_${Date.now()}.log`)
    );

    serverProcess = spawn('java', ['-Xmx2G', '-jar', 'spigot.jar', 'nogui'], {
      cwd: SERVER_DIR
    });

    let serverReady = false;
    let outputBuffer = '';

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer += output;
      logStream.write(`[STDOUT] ${output}`);
      console.log(`Server output: ${output.trim()}`);

      if (output.includes('Done') && output.includes('For help, type')) {
        serverReady = true;
        updateStatus('running');
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      logStream.write(`[STDERR] ${data}`);
      console.error(`Server error: ${data}`);
    });

    serverProcess.on('close', (code) => {
      logStream.end();
      console.log(`Server process closed with code: ${code}, serverReady: ${serverReady}`);
      if (!serverReady) {
        updateStatus('stopped');
        serverProcess = null;
        reject(new Error(`Server process exited with code ${code} before completion`));
      }
    });

    setTimeout(() => {
      if (!serverReady) {
        logStream.write('[WARNING] Server startup timed out, checking output buffer...\n');
        console.log(`Output buffer: ${outputBuffer}`);
        if (outputBuffer.includes('Done') && outputBuffer.includes('For help, type')) {
          serverReady = true;
          updateStatus('running');
          resolve();
        } else {
          serverProcess.kill();
          updateStatus('stopped');
          serverProcess = null;
          reject(new Error('Server startup timed out and did not reach "Done"'));
        }
      }
    }, 60000);
  });
}

function stopServer() {
  return new Promise((resolve, reject) => {
    const status = JSON.parse(fs.readFileSync(STATUS_FILE));
    console.log(`Current status: ${JSON.stringify(status)}, serverProcess: ${serverProcess ? 'active' : 'null'}`);
    if (status.server_status !== 'running') {
      return reject(new Error('الخادوم غير مشغل حالياً!'));
    }
    if (!serverProcess) {
      updateStatus('stopped');
      return reject(new Error('لا يوجد عملية خادوم نشطة!'));
    }

    serverProcess.stdin.write('stop\n');
    serverProcess.stdin.end();

    serverProcess.on('close', (code) => {
      updateStatus('stopped');
      serverProcess = null;
      console.log(`Server stopped with code: ${code}`);
      resolve();
    });
  });
}

function getServerStatus() {
  const status = JSON.parse(fs.readFileSync(STATUS_FILE));
  console.log(`Retrieved status: ${JSON.stringify(status)}, serverProcess: ${serverProcess ? 'active' : 'null'}`);
  return status;
}

module.exports = { startServer, stopServer, getServerStatus, updateStatus };