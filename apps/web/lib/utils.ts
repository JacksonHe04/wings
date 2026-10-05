import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 class：条件类名用 clsx，冲突类名交给 tailwind-merge 后者胜出。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
