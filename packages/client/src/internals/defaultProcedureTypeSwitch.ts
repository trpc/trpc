import { ProcedureTypeSwitch } from '..';

const subscriptionPaths = /\b(on)/;
const mutationPaths = /\b(edit|create|add|delete|remove|do)/;
export const defaultProcedureTypeSwitch: ProcedureTypeSwitch = (op) => {
  if (mutationPaths.test(op.path)) {
    return 'mutation';
  }
  if (subscriptionPaths.test(op.path)) {
    return 'subscription';
  }
  return 'query';
};
