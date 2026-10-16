import { oc, ProcedureContract } from '@orpc/contract'
import { DecoratedProcedure, os } from '@orpc/server'
import z from 'zod'
import { getOpenAPIMeta } from '../meta'
import './route'

it('adds .route metadata through contract builder variants', () => {
  const procedure = oc
    .route({ tags: ['1'] })
    .input(z.object({}))
    .route({ tags: ['2'] })
    .output(z.object())
    .route({ tags: ['3'] })

  expect(procedure).toBeInstanceOf(ProcedureContract)
  expect(getOpenAPIMeta(procedure)?.tags).toEqual(['1', '2', '3'])
})

it('adds .route metadata through server builder variants and decorated procedure', () => {
  const procedure = os
    .route({ tags: ['1'] })
    .use(({ next }) => next())
    .route({ tags: ['2'] })
    .input(z.object({}))
    .route({ tags: ['3'] })
    .output(z.object())
    .route({ tags: ['4'] })
    .handler(() => ({}))
    .route({ tags: ['5'] })

  expect(procedure).toBeInstanceOf(DecoratedProcedure)
  expect(getOpenAPIMeta(procedure)?.tags).toEqual(['1', '2', '3', '4', '5'])
})
