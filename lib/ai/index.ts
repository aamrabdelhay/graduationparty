/** AI facade: choose provider from config, run generation, store result. */
import sharp from "sharp";
import { getAiProvider } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createImageAsset } from "@/lib/assets";
import type { ImageAssetRow } from "@/db/schema";
import type { CapGenerator } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { OfflineCapGenerator } from "./providers/offline";

let cachedGenerator: CapGenerator | null = null;
export function getCapGenerator(): CapGenerator { if(cachedGenerator)return cachedGenerator; cachedGenerator=getAiProvider()==="openai"?new OpenAIProvider():new OfflineCapGenerator(); return cachedGenerator; }
export interface GenerateCapResult { asset:ImageAssetRow; provider:string }
export interface GenerateCapOptions { adultAsset:ImageAssetRow; committed?:boolean; participantId?:string|null; metadata?:Record<string,unknown> }

export async function generateAndStoreGraduationImage(opts:GenerateCapOptions):Promise<GenerateCapResult>{
  let generator=getCapGenerator();
  let result;
  try { result=await generator.generate({adultAsset:opts.adultAsset,adultImageUrl:opts.adultAsset.publicUrl}); }
  catch(err){
    if(generator.providerName!=="openai") throw err;
    logger.error("openai cap generation failed; using offline fallback",{error:err instanceof Error?err.message:String(err)});
    generator=new OfflineCapGenerator();
    result=await generator.generate({adultAsset:opts.adultAsset,adultImageUrl:opts.adultAsset.publicUrl});
  }
  const meta=await sharp(result.buffer).metadata();
  const asset=await createImageAsset({kind:"GRADUATION",buffer:result.buffer,mimeType:result.mimeType,extension:result.extension,width:meta.width??0,height:meta.height??0,committed:opts.committed??false,participantId:opts.participantId??null,metadata:{provider:result.provider,aiFallback:result.provider==="offline",...(opts.metadata??{})}});
  logger.info("ai cap generated",{assetId:asset.id,provider:result.provider,width:meta.width,height:meta.height});
  return {asset,provider:result.provider};
}
