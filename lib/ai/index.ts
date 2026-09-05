/** AI facade: choose provider, generate the edit, and persist the result. */
import sharp from "sharp";
import { getAiProvider, isProduction } from "@/lib/env";
import { createImageAsset } from "@/lib/assets";
import type { ImageAssetRow } from "@/db/schema";
import type { CapGenerator } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { OfflineCapGenerator } from "./providers/offline";
import { logger } from "@/lib/logger";

let cachedGenerator: CapGenerator | null = null;
export function getCapGenerator():CapGenerator{
  if(cachedGenerator)return cachedGenerator;
  const provider=getAiProvider();
  if(provider==="openai"){
    cachedGenerator=new OpenAIProvider();
    return cachedGenerator;
  }
  if(isProduction())throw new Error("Production AI is not configured. Set AI_PROVIDER=openai and AI_API_KEY in Vercel.");
  cachedGenerator=new OfflineCapGenerator();
  return cachedGenerator;
}
export interface GenerateCapResult{asset:ImageAssetRow;provider:string}
export interface GenerateCapOptions{adultAsset:ImageAssetRow;committed?:boolean;participantId?:string|null;metadata?:Record<string,unknown>}
export async function generateAndStoreGraduationImage(opts:GenerateCapOptions):Promise<GenerateCapResult>{
  const generator=getCapGenerator();
  let result;
  try{result=await generator.generate({adultAsset:opts.adultAsset,adultImageUrl:opts.adultAsset.publicUrl});}
  catch(err){logger.error("cap generation failed",{provider:generator.providerName,error:err instanceof Error?err.message:String(err)});throw err;}
  const meta=await sharp(result.buffer).metadata();
  const asset=await createImageAsset({kind:"GRADUATION",buffer:result.buffer,mimeType:result.mimeType,extension:result.extension,width:meta.width??0,height:meta.height??0,committed:opts.committed??false,participantId:opts.participantId??null,metadata:{provider:result.provider,aiFallback:false,...(opts.metadata??{})}});
  logger.info("ai cap generated",{assetId:asset.id,provider:result.provider,width:meta.width,height:meta.height});
  return{asset,provider:result.provider};
}
