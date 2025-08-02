export function getTimeDifference(start, end = new Date()) {
  const startTime = new Date(start);
  const endTime = new Date(end);

  const diffInMs = startTime - endTime;

  if (diffInMs <= 0) return "Time expired";

  const totalSeconds = Math.floor(diffInMs / 1000);

  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const totalSecond = Math.floor(diffInMs / 1000);
  const officalTimeFormat = `${days}d ${hours}h ${minutes}m ${seconds}s`;

  console.log(totalSecond);
  return {
    totalSecond,
    officalTimeFormat
  };
}