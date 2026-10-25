import { File, Paths } from "expo-file-system";
import type { RoadDataStore } from "../../../shared/roadConditions";

/** Road data saved as files in the app cache (the OS may clear it). Files
 * avoid AsyncStorage's small size limit; one area can be several hundred KB. */
export const fileRoadDataStore: RoadDataStore = {
  async read(key) {
    const file = new File(Paths.cache, `${key}.json`);
    return file.exists ? await file.text() : null;
  },
  async write(key, value) {
    const file = new File(Paths.cache, `${key}.json`);
    if (!file.exists) file.create();
    file.write(value);
  },
};
