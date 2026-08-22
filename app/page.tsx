import { WaveAtlas, type WaveRecord } from "./WaveAtlas";
import wavesData from "./waves-data.json";

export default function Home() {
  return <WaveAtlas waves={wavesData as WaveRecord[]} />;
}
