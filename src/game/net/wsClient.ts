import type { MsgType, WsMessage } from "../protocol";

export class WsClient {
    private ws: WebSocket;
    private onMessage: (msg: WsMessage<any>) => void;

    constructor(url: string, onMessage: (msg: WsMessage<any>) => void) {
        this.ws = new WebSocket(url);
        this.onMessage = onMessage;
        this.ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data));
    }

    onOpen(cb: () => void) {
        this.ws.onopen = cb;
    }

    send(type: MsgType, payload: any) {
        if (this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type, payload }));
    }

    get raw() {
        return this.ws;
    }
}
