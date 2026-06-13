import axios from "axios";

const url =
  "https://anikai.to/iframe/Ksf-sOWq_1C7hntHyI7D92VY4MJX9A3J7KIGlHl2cRT41Q_CtZPnyR07eahTeg";
const res = await axios.get(url, {
  headers: { "User-Agent": "Mozilla/5.0", Referer: "https://anikai.to/" },
});
const html = String(res.data);
console.log("len", html.length);
const m3u8 = html.match(/https?:[^"']+\.m3u8[^"']*/g);
const mp4 = html.match(/https?:[^"']+\.mp4[^"']*/g);
console.log("m3u8", m3u8?.slice(0, 3));
console.log("mp4", mp4?.slice(0, 3));
const enc = html.match(/result[^"]*"([^"]{20,})"/);
console.log("enc sample", enc?.[1]?.slice(0, 80));
