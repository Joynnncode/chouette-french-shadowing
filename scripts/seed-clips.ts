import { db } from "../src/db";
import { clips } from "../src/db/schema";
import { extractYoutubeVideoId, getTranscript, getVideoInfo } from "../src/lib/youtube";

const STARTER_CLIPS: { url: string; level: "A1" | "A2" | "B1" | "B2" }[] = [
  { url: "https://www.youtube.com/watch?v=67zkQMESebE", level: "A1" },
  { url: "https://www.youtube.com/watch?v=hRlrS6DV6dg", level: "A1" },
  { url: "https://www.youtube.com/watch?v=t0NKrBc2Zg0", level: "A2" },
  { url: "https://www.youtube.com/watch?v=o6SyaX2gML8", level: "A2" },
  { url: "https://www.youtube.com/watch?v=by4jOVIV6EU", level: "B1" },
  { url: "https://www.youtube.com/watch?v=mOUNWkylYe4", level: "B1" },
  { url: "https://www.youtube.com/watch?v=HN5g9L1D1cg", level: "B2" },
  { url: "https://www.youtube.com/watch?v=2afwvUMFnsU", level: "B2" },
  { url: "https://www.youtube.com/watch?v=MHoDEP-rF4c", level: "B2" },
];

async function main() {
  for (const { url, level } of STARTER_CLIPS) {
    const videoId = extractYoutubeVideoId(url);
    if (!videoId) {
      console.error(`Could not parse video id from ${url}`);
      continue;
    }

    const existing = await db.query.clips.findFirst({
      where: (c, { eq }) => eq(c.youtubeVideoId, videoId),
    });
    if (existing) {
      console.log(`Skipping ${videoId} (already in library)`);
      continue;
    }

    const info = await getVideoInfo(videoId);
    if (!info) {
      console.error(`Could not fetch info for ${videoId}`);
      continue;
    }

    const transcript = await getTranscript(videoId).catch(() => null);

    await db.insert(clips).values({
      youtubeVideoId: videoId,
      title: info.title,
      channelName: info.channelName,
      level,
      transcript,
    });

    console.log(
      `Added [${level}] "${info.title}" (${info.channelName ?? "unknown channel"})${
        transcript ? "" : " — no transcript found"
      }`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
