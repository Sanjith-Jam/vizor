import { HelmetConnection } from "./HelmetConnection";
let instance: HelmetConnection | null = null;
export function getHelmetConnection() {
  return (instance ??= new HelmetConnection());
}
