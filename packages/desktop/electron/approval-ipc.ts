import {
  ApprovalListInputSchema,
  ApprovalModeSetInputSchema,
  ApprovalRespondInputSchema,
  IPC_CHANNELS,
  type DesktopApprovalModeDto,
  type DesktopApprovalRequestDto,
  type DesktopApprovalResponseDto,
  type PreH1PreparationReviewDto,
  type PreH1PreparationResultDto,
  type PreH1NativeConsentReviewDto,
  type PreH1NativeConsentResultDto,
  type IpcResult,
} from '@sud-d/contracts';
import type { AppError, Result } from '@sud-d/domain';
import type { DesktopApprovalController } from './approval-controller.js';
import type { createPreH1MissionPreparationBridge } from './pre-h1-mission-preparation.js';
import type {createPreH1NativeConsentBridge} from './pre-h1-native-consent.js';

interface IpcInvokeEventLike {
  readonly sender: unknown;
}

export interface ApprovalIpcMain {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, raw?: unknown) => unknown,
  ): void;
}

export type ApprovalIpcSenderValidator = (sender: unknown) => boolean;

function ipcResult<T>(result: Result<T, AppError>): IpcResult<T> {
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, error: result.error };
}

function validationError(message: string): IpcResult<never> {
  return { ok: false, error: { code: 'VALIDATION_FAILED', message } };
}

export function registerDesktopApprovalIpcHandlers(
  ipcMain: ApprovalIpcMain,
  controller: DesktopApprovalController,
  isSenderValid: ApprovalIpcSenderValidator,
  bridge?:ReturnType<typeof createPreH1MissionPreparationBridge>,
  nativeBridge?:ReturnType<typeof createPreH1NativeConsentBridge>,
): void {
  if (bridge) {
    ipcMain.handle(IPC_CHANNELS.PRE_H1_PREPARE_REVIEW,(event)=>{
      if(!isSenderValid(event.sender))return validationError('Invalid sender');
      try{return {ok:true,value:bridge.inspect() satisfies PreH1PreparationReviewDto};}
      catch{return validationError('PRE-H1 Workspace is not ready or proposal is stale');}
    });
    ipcMain.handle(IPC_CHANNELS.PRE_H1_PREPARE_REQUEST,async(event)=>{
      if(!isSenderValid(event.sender))return validationError('Invalid sender');
      try{
        const result=await bridge.request();
        const value:PreH1PreparationResultDto={
          state:result.ok?'reserved':result.code==='APPROVAL_REQUIRED'?'pending':'blocked',
          code:result.code,
          ...(!result.ok&&result.approvalRequestId?{approvalRequestId:result.approvalRequestId}:{}),
        };
        return{ok:true,value};
      }catch{return validationError('PRE-H1 Mission request already terminated');}
    });
    ipcMain.handle(IPC_CHANNELS.PRE_H1_PREPARE_CANCEL,(event)=>{
      if(!isSenderValid(event.sender))return validationError('Invalid sender');
      const result=bridge.cancelUnused();
      return ipcResult<null>(result.ok?{ok:true,value:null}:result);
    });
  }
  if(nativeBridge){
    ipcMain.handle(IPC_CHANNELS.PRE_H1_NATIVE_REVIEW,event=>{
      if(!isSenderValid(event.sender))return validationError('Invalid sender');
      try{return{ok:true,value:nativeBridge.inspect() satisfies PreH1NativeConsentReviewDto};}
      catch{return validationError('Native scope or exact artifacts unavailable');}
    });
    ipcMain.handle(IPC_CHANNELS.PRE_H1_NATIVE_REQUEST,async event=>{
      if(!isSenderValid(event.sender))return validationError('Invalid sender');
      try{
        const result=await nativeBridge.request();
        const value:PreH1NativeConsentResultDto={
          state:result.ok?'recorded':result.code==='APPROVAL_REQUIRED'?'pending':'blocked',
          code:result.code,
          ...(!result.ok&&result.approvalRequestId?{approvalRequestId:result.approvalRequestId}:{}),
        };
        return{ok:true,value};
      }catch{return validationError('Native consent already terminated');}
    });
  }
  ipcMain.handle(IPC_CHANNELS.APPROVAL_LIST, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = ApprovalListInputSchema.safeParse(raw ?? {});
    if (!parsed.success) return validationError('Invalid approval list request');
    return ipcResult<DesktopApprovalRequestDto[]>(controller.list(parsed.data));
  });

  ipcMain.handle(IPC_CHANNELS.APPROVAL_RESPOND, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = ApprovalRespondInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid approval decision request');
    return ipcResult<DesktopApprovalResponseDto>(controller.respond(parsed.data));
  });

  ipcMain.handle(IPC_CHANNELS.APPROVAL_MODE_GET, (event) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    return ipcResult<DesktopApprovalModeDto>(controller.getMode());
  });

  ipcMain.handle(IPC_CHANNELS.APPROVAL_MODE_SET, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = ApprovalModeSetInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Approval Mode request');
    return ipcResult<DesktopApprovalModeDto>(controller.setMode(parsed.data));
  });
}
