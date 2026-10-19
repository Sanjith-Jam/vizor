/** Browser preview reports missing hardware; it never simulates a connection. */
export enum State {
  Unknown = "Unknown",
  Resetting = "Resetting",
  Unsupported = "Unsupported",
  Unauthorized = "Unauthorized",
  PoweredOff = "PoweredOff",
  PoweredOn = "PoweredOn",
}
export class BleManager {
  async state() {
    return State.Unsupported;
  }
  onStateChange(listener: (state: State) => void, emitCurrent: boolean) {
    if (emitCurrent) listener(State.Unsupported);
    return { remove() {} };
  }
  async enable() {
    throw new Error("Bluetooth unsupported in browser preview");
  }
  stopDeviceScan() {}
  startDeviceScan(
    _uuids: unknown,
    _options: unknown,
    listener: (error: Error, device: null) => void,
  ) {
    listener(new Error("Bluetooth unsupported in browser preview"), null);
  }
  async connectToDevice() {
    throw new Error("Bluetooth unsupported in browser preview");
  }
  async destroy() {}
}
