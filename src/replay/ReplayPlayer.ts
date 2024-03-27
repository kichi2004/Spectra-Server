import { ReplayConnectorService } from "./ReplayConnectorService";
import { DataTypes, IAuthedData, IFormattedData } from '../model/eventData';
import { readFileSync } from "fs";
import logging from "../util/Logging";
const Log = logging("ReplayPlayer");

export class ReplayPlayer {

    private connector: ReplayConnectorService;
    private mode: ReplayMode;
    private delay: number = 500;

    private replayHeaderData: any;
    private replayData: IAuthedData[] = [];
    private currentReplayIndex: number = 0;

    private finishedCallback?: Function;

    public constructor(replayConnectorService: ReplayConnectorService, replayMode: ReplayMode, delay?: number) {
        this.connector = replayConnectorService;
        this.mode = replayMode;
        if (delay != null) this.delay = delay;
    }

    public loadReplayFile(filePath: string) {
        const replayContent = readFileSync(filePath).toString();
        const replayObj = JSON.parse(`[${replayContent}]`);
        this.replayHeaderData = replayObj.shift();
        this.replayData = replayObj;
    
        Log.info(`Loaded replay file ${filePath}`);
        Log.info("Header info is:");
        Log.info(this.replayHeaderData);
    }

    public getReplayHeader(): any {
        return this.replayHeaderData;
    }

    public play(callback?: Function) {
        this.finishedCallback = callback;
        Log.info(`Starting playback in ${this.mode} mode`);
        new Promise((resolve, reject) => {
            switch(this.mode) {
                case ReplayMode.INSTANT:
                    this.playInstant();
                    break;
                case ReplayMode.DELAY:
                    this.playDelay();
                    break;
                case ReplayMode.TIMESTAMPS:
                    this.playTimestamps();
                    break;
                case ReplayMode.MANUAL:
                    this.playManual();
                    break;
            }
        });
    }

    private sendNextEvent(): boolean {
        this.connector.sendReplayData(this.replayData[this.currentReplayIndex]);
        this.currentReplayIndex++;
        return this.currentReplayIndex < this.replayData.length;
    }

    private finished() {
        Log.info("Replay has finished");
        if (this.finishedCallback != null) {
            this.finishedCallback();
        }
    }

    private playInstant() {
        while(this.sendNextEvent()) {}    //empty while body on purpose
        this.finished();
    }

    private playDelay() {
        const intervalId = setInterval(() => {
            if (!this.sendNextEvent()) {
                clearInterval(intervalId);
                this.finished();
            }
            Log.info(`Waiting ${this.delay} ms`);
        }, this.delay);
    }

    private playTimestamps() {
        if (this.sendNextEvent()) {
            const timestamp1 = this.replayData[this.currentReplayIndex - 1].timestamp;
            const timestamp2 = this.replayData[this.currentReplayIndex].timestamp;
            const nextDelay = timestamp2 - timestamp1;
            Log.info(`Waiting ${nextDelay} ms`);
            setTimeout(() => this.playTimestamps(), nextDelay);
        }
        else {
            this.finished();
        }
    }

    private playManual() {
        const stream = process.stdin;
        stream.on("data", (data) => {
            let s = data.toString();
            let amount = Number.parseInt(s);
            let ready = true;
            if (s == "\n") {
                ready = this.sendNextEvent();
            }
            else if (s == "exit\n") {
                ready = false;
            }
            else if (s == "go\n") {
                while(this.sendNextEvent()) {}    //empty while body on purpose
                ready = false;
            }
            else if (!Number.isNaN(amount)) {
                Log.info(`Sending the next ${amount} events`);
                for (let i = 0; i < amount && (ready = this.sendNextEvent()); i++) {} //empty for body on purpose
            }

            if (!ready) {
                stream.removeAllListeners();
                this.finished();
            }
        });
        Log.info("Ready ['exit' to exit | 'go' to finish replay]");
    }

}

export enum ReplayMode {
    DELAY = "delay",
    INSTANT = "instant",
    TIMESTAMPS = "timestamps",
    MANUAL = "manual"
}