import { ProcedureContract } from './procedure'

describe('procedureContract', () => {
  const procedure = new ProcedureContract({
    errorMap: {},
    meta: {},
    inputSchemas: [],
    outputSchemas: [],
  })

  describe('instanceof', () => {
    it('support both instanceof and structural check', () => {
      expect(procedure).toBeInstanceOf(ProcedureContract)
      expect({ '~orpc': procedure['~orpc'] }).toBeInstanceOf(ProcedureContract)

      expect({}).not.toBeInstanceOf(ProcedureContract)
      expect({ '~orpc': {} }).not.toBeInstanceOf(ProcedureContract)
      expect({ '~orpc': {
        ...procedure['~orpc'],
        errorMap: 'invalid',
      } }).not.toBeInstanceOf(ProcedureContract)
      expect({ '~orpc': {
        ...procedure['~orpc'],
        meta: 'invalid',
      } }).not.toBeInstanceOf(ProcedureContract)
    })

    it('not support structural for extended class', () => {
      class ExtendedProcedureContract extends ProcedureContract<any, any, any> {
        constructor() {
          super({
            ...procedure['~orpc'],
            errorMap: {},
            meta: {},
          })
        }
      }

      expect(new ExtendedProcedureContract()).toBeInstanceOf(ProcedureContract)
      expect(new ExtendedProcedureContract()).toBeInstanceOf(ExtendedProcedureContract)

      expect({ '~orpc': new ExtendedProcedureContract()['~orpc'] }).toBeInstanceOf(ProcedureContract)
      expect({ '~orpc': new ExtendedProcedureContract()['~orpc'] }).not.toBeInstanceOf(ExtendedProcedureContract)
    })
  })
})
