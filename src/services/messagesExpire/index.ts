import { IConfig } from "../../../config";
import { MessageType } from "../../enums";
import { IMessageHandler } from "../../messageHandler";
import { IRealm } from "../../models/realm";

export interface IMessagesExpire {
  startMessagesExpiration(): void;
  stopMessagesExpiration(): void;
}

export class MessagesExpire implements IMessagesExpire {
  private readonly realm: IRealm;
  private readonly config: IConfig;
  private readonly messageHandler: IMessageHandler;

  private timeoutId: NodeJS.Timeout = null;

  constructor({ realm, config, messageHandler }: {
    realm: IRealm;
    config: IConfig;
    messageHandler: IMessageHandler;
  }) {
    this.realm = realm;
    this.config = config;
    this.messageHandler = messageHandler;
  }

  public startMessagesExpiration(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    // Clean up outstanding messages
    this.timeoutId = setTimeout(() => {
      this.pruneOutstanding();

      this.timeoutId = null;

      this.startMessagesExpiration();
    }, this.config.cleanup_out_msgs);
  }

  public stopMessagesExpiration(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private pruneOutstanding(): void {
    const destinationClientsIds = this.realm.getClientsIdsWithQueue();

    const now = new Date().getTime();
    const maxDiff = this.config.expire_timeout;

    const seen: { [id: string]: boolean } = {};

    for (const destinationClientId of destinationClientsIds) {
      const messageQueue = this.realm.getMessageQueueById(destinationClientId);
      const lastReadDiff = now - messageQueue.getLastReadAt();

      if (lastReadDiff < maxDiff) { continue; }

      const messages = messageQueue.getMessages();

      for (const message of messages) {
        if (!seen[message.src]) {
          this.messageHandler.handle(null, {
            type: MessageType.EXPIRE,
            src: message.dst,
            dst: message.src
          });

          seen[message.src] = true;
        }
      }

      this.realm.clearMessageQueue(destinationClientId);
    }
  }
}
