require('dotenv').config()
import { Server } from "socket.io";
import logging from "../util/Logging";
import { readFileSync } from "fs";
import { createServer } from "https";
const Log = logging("WebsocketOutgoing");

export class WebsocketOutgoing {
    private static instance: WebsocketOutgoing;
    wss: Server;


    public static getInstance(): WebsocketOutgoing {
        if (WebsocketOutgoing.instance == null) WebsocketOutgoing.instance = new WebsocketOutgoing();
        return WebsocketOutgoing.instance;
    }

    constructor() {

        const options = {
            key: readFileSync(process.env.SERVER_KEY!),
            cert: readFileSync(process.env.SERVER_CERT!),
            requestCert: true,
            ca: [
                readFileSync(process.env.CLIENT_CERT!)
            ]
        }

        const httpsServer = createServer(options);
        
        this.wss = new Server(httpsServer, {
            perMessageDeflate: {
                zlibDeflateOptions: {
                    chunkSize: 1024,
                    memLevel: 7,
                    level: 3
                },
                zlibInflateOptions: {
                    chunkSize: 10 * 1024
                },
                threshold: 1024
            },
            cors: { origin: "*" }
        });

        this.wss.on(`connection`, (ws) => {
            ws.on('error', (e) => {
                Log.error(`Someone in ${ws.rooms} encountered a Websocket error: ${e}`);
            });

            ws.once('logon', (msg: string) => {
                try {
                    const json = JSON.parse(msg);
                    ws.join(json.groupCode);
                    ws.emit("logon_success", JSON.stringify({ groupCode: json.groupCode, msg: `Logon succeeded for group code ${json.groupCode}` }));
                    Log.info(`Received output logon using Group Code ${json.groupCode}`);
                } catch (e) {
                    Log.error(`Error parsing outgoing logon request: ${e}`);
                }
            });
        });

        this.wss.engine.on("connection_error", (err) => {
            console.log("Socket.IO error: ", err);
        });

        httpsServer.listen(5200);

        Log.info(`InhouseTracker Server outputting on port 5200!`);
    }

    sendMatchData(groupCode: string, data: any) {
        this.wss.to(groupCode).emit("match_data", JSON.stringify(data));
    }

}