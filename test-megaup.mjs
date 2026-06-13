import axios from "axios";

const megaupUrl = "https://megaup.cc/e/lpD1JWCtWS2JcOLyGL9D7BfpCQ?";
const mediaUrl = megaupUrl.replace("/e/", "/media/");
console.log("mediaUrl", mediaUrl);

const res = await axios.get(mediaUrl, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  },
});
console.log("response keys", Object.keys(res.data));
console.log("result preview", String(res.data?.result ?? res.data).slice(0, 120));

if (res.data?.result) {
  const dec = await axios.post(
    "https://enc-dec.app/api/dec-mega",
    {
      text: res.data.result,
      agent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    },
    { headers: { "Content-Type": "application/json" } },
  );
  console.log("decrypted sources", dec.data?.result?.sources?.slice(0, 2));
}
