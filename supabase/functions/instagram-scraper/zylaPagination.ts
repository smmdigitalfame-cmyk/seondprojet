export function zylaPagination(page: any) {
  const pagination = page?.data?.pagination;
  const cursor = String(pagination?.nextCursor || page?.data?.nextCursor || page?.nextCursor || "");
  return { cursor, hasMore: !!cursor && pagination?.hasNextPage !== false };
}

export function zylaMedia(p: any, reel = false) {
  const first = Array.isArray(p.mediaList) ? p.mediaList[0] || {} : {};
  const downloadUrl = String(first.downloadUrl || p.downloadUrl || p.videoUrl || "");
  const isVideo = reel || String(first.mediaType || "").toUpperCase() === "VIDEO" || !!p.isVideo || !!p.videoUrl;
  return {
    isVideo,
    downloadUrl,
    thumbnail: String(p.thumbnailUrl || first.thumbnailUrl || (!isVideo ? downloadUrl : "")),
    videoUrl: isVideo && !/\.m3u8/i.test(downloadUrl) ? downloadUrl : "",
  };
}