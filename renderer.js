const ws = require('ws');
const buffer = require('buffer');

let consoleText = '';
let wellsAckHash = {};
let msaArray = [];
const VT = String.fromCharCode(0x0b);
const FS = String.fromCharCode(0x1c);
const CR = String.fromCharCode(0x0d);

function clearConsole() {
  consoleText = '';
  document.querySelector('#console').innerHTML = consoleText;
}

window.addEventListener('DOMContentLoaded', (event) => {
  document.getElementById("clear-button").addEventListener("click", clearConsole);
});

function addConsoleEntry(message) {
  consoleText += `\n${message}`;
  document.querySelector('#console').innerHTML = consoleText;
}

const wss = new ws.WebSocketServer({ port: 9898 });

addConsoleEntry('Listening on port 9898');


// websocket server for frontend
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
      addConsoleEntry('Data received from front')
    
      const { port, ipAdress, data, wellList } = payload;

			wellsAckHash = wellList;
      
      const net = require('net');

      const clientOptions = {
        host: ipAdress,
        port: port,
      };

      // client for hl7 receiver server
      const client = net.createConnection(clientOptions, () => {
				addConsoleEntry(`connected to HL7 server!`);
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
				
        const missingAck = wellsAckHash.some((well) => well === null)
				
        if (!missingAck) {
          addConsoleEntry(`HL7 answer data: all messages have been received`);
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