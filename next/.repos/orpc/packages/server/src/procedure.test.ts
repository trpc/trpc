import { ProcedureContract } from '@orpc/contract'
import { Procedure } from './procedure'

describe('procedure', () => {
  const procedure = new Procedure({
    errorMap: {},
    meta: {},
    inputSchemas: [],
    outputSchemas: [],
    orderedMiddlewares: [],
    handler: async () => {},
  })

  describe('instanceof', () => {
    it('support both instanceof and structural check', () => {
      expect(procedure).toBeInstanceOf(Procedure)
      expect({ '~orpc': procedure['~orpc'] }).toBeInstanceOf(Procedure)

      expect({}).not.toBeInstanceOf(Procedure)
      expect({ '~orpc': {} }).not.toBeInstanceOf(Procedure)
      expect({ '~orpc': {
        ...procedure['~orpc'],
        errorMap: 'invalid',
      } }).not.toBeInstanceOf(Procedure)
      expect({ '~orpc': {
        ...procedure['~orpc'],
        meta: 'invalid',
      } }).not.toBeInstanceOf(Procedure)

      expect({ '~orpc': {
        ...procedure['~orpc'],
        orderedMiddlewares: 'invalid', // invalid orderedMiddlewares
      } }).not.toBeInstanceOf(Procedure)

      expect({ '~orpc': {
        ...procedure['~orpc'],
        handler: 'invalid', // invalid handler
      } }).not.toBeInstanceOf(Procedure)

      expect(new ProcedureContract({
        errorMap: {},
        meta: {},
      })).not.toBeInstanceOf(Procedure)
    })

    it('not support structural for extended class', () => {
      class ExtendedProcedure extends Procedure<any, any, any, any, any> {
        constructor() {
          super({
            ...procedure['~orpc'],
          })
        }
      }

      expect(new ExtendedProcedure()).toBeInstanceOf(Procedure)
      expect(new ExtendedProcedure()).toBeInstanceOf(ExtendedProcedure)

      expect({ '~orpc': new ExtendedProcedure()['~orpc'] }).toBeInstanceOf(Procedure)
      expect({ '~orpc': new ExtendedProcedure()['~orpc'] }).not.toBeInstanceOf(ExtendedProcedure)
    })
  })
})
