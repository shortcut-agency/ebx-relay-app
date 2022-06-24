const ws = require('ws');
const buffer = require('buffer');
const notification = document.getElementById('notification');
const message = document.getElementById('message');
const restartButton = document.getElementById('restart-button');
const { ipcRenderer } = require('electron');

let consoleText = '';
let wellsAckHash = {};
let msaArray = [];
let latestVersionInstalled = true;
const VT = String.fromCharCode(0x0b);
const FS = String.fromCharCode(0x1c);
const CR = String.fromCharCode(0x0d);

function clearConsole() {
  consoleText = '';
  document.querySelector('#console').innerHTML = consoleText;
}

window.addEventListener('DOMContentLoaded', (event) => {
  document.getElementById("clear-button").addEventListener("click", clearConsole);
  restartButton.addEventListener("click", restartApp);

  ipcRenderer.on('update_available', () => {
    latestVersionInstalled = false;
    ipcRenderer.removeAllListeners('update_available');
    message.innerText = 'A new update is available. Downloading now...';
    notification.classList.remove('hidden');
  });
  ipcRenderer.on('update_downloaded', () => {
    ipcRenderer.removeAllListeners('update_downloaded');
    message.innerText = 'A new version is available. Application must restart.';
    restartButton.classList.remove('hidden');
    notification.classList.remove('hidden');
  });
});

function restartApp() {
  ipcRenderer.send('restart_app');
}

function addConsoleEntry(message) {
  consoleText += `\n${message}`;
  document.querySelector('#console').innerHTML = consoleText;
}

const wss = new ws.WebSocketServer({ port: 9898 });

addConsoleEntry('Listening on port 9898');


// websocket server for frontend
if (latestVersionInstalled) {
  wss.on('connection', (websocketConnection) => {
    msaArray = [];
    addConsoleEntry('New connection on port 9898');
    websocketConnection.on('message', (message) => {
      const parsedMessage = JSON.parse(message);
      const { header, payload } = parsedMessage;
      if (header === 'runningTest') {
        websocketConnection.send(JSON.stringify({
          header: 'runningTestResponse',
          payload: {
            running: true,
          }
        }));
      } else if (header === 'hl7data') {
        addConsoleEntry("New segments received...\n")
      
        const { port, ipAdress, data, wellList } = payload;
  
        wellsAckHash = wellList;
        
        const net = require('net');
  
        const clientOptions = {
          host: ipAdress,
          port: port,
        };
  
        // client for hl7 receiver server
        const client = net.createConnection(clientOptions, () => {
          addConsoleEntry("Connected to HL7 server! ...Transmitting\n");
          data.forEach(wellData => {
            client.write(buffer.Buffer.from(wellData, encoding = 'utf8'));
          })
        });

        client.on('data', (data) => {
          const ansData = data.toString();
          const splittedAck = ansData.split(VT);
  
          splittedAck.forEach((slice) => {
            const msa = slice.replace(CR, '\n').replace(FS, '');
            msaArray.push(msa);
            const ackSegment = msa.match(/(?<=MSA\|).*/g);
            if (ackSegment) {
              const ackCodeAndIndexPuit = ackSegment[0].split('|');
              const [ackCode, indexPuit] = ackCodeAndIndexPuit;
              wellsAckHash[indexPuit] = ackCode;
            }
          })

          // wait for all ACKs to close connection
          const missingAck = Object.values(wellsAckHash).some((well) => well === null)
          if (!missingAck) {
            addConsoleEntry('HL7 answer data: all messages have been received');
            websocketConnection.send(JSON.stringify({
              header: 'ackResponse',
              payload: {
                wellAckList: wellsAckHash,
                msaArray: msaArray.filter((msa) => msa && msa !== ''),
              }
            }));
            client.end();
          }
        });
        client.on('error', (err) => {
          const reqerror = `${new Date()} problem with request: ${err.message}`;
          addConsoleEntry(reqerror);
          client.end();
          addConsoleEntry(`disconnected from HL7 server`);
        });
        client.on('end', () => {
          addConsoleEntry(`disconnected from HL7 server`);
        });
        
      }
    });
  });
}