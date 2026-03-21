import { describe, expectTypeOf, test } from 'vitest';
import { TRPCError } from './TRPCError';
import {
  createTRPCFineGrainedError,
  isTRPCFineGrainedError,
} from './TRPCFineGrainedError';

describe(createTRPCFineGrainedError, () => {
  test('creates distinct fine-grained error classes', () => {
    const MyError = createTRPCFineGrainedError('NOT_FOUND').create();
    const OtherError = createTRPCFineGrainedError('NOT_FOUND').create();
    const err = new MyError();
    const otherErr = new OtherError();

    expect(err).toBeInstanceOf(TRPCError);
    expect(otherErr).toBeInstanceOf(TRPCError);
    expect(err).toBeInstanceOf(MyError);
    expect(err).not.toBeInstanceOf(OtherError);
    expect(isTRPCFineGrainedError(err)).toBe(true);
    expect(isTRPCFineGrainedError(otherErr)).toBe(true);
  });

  test('uses the code as the literal message', () => {
    const MyError = createTRPCFineGrainedError('BAD_REQUEST').create();

    const err = new MyError();
    expect(err.message).toBe('BAD_REQUEST');
    expectTypeOf(err.message).toEqualTypeOf<'BAD_REQUEST'>();
  });

  test('toShape returns correct shape with defaulted data', () => {
    const MyError = createTRPCFineGrainedError('NOT_FOUND')
      .data<{
        resourceType: 'user';
      }>()
      .create({
        defaults: {
          resourceType: 'user',
        },
      });

    const err = new MyError();
    expect(err.toShape()).toEqual({
      code: -32004,
      message: 'NOT_FOUND',
      data: { resourceType: 'user' },
    });
  });

  test('constructor input requires only missing required extra fields', () => {
    const NeedsFoo = createTRPCFineGrainedError('BAD_REQUEST')
      .data<{
        foo: string;
        bar?: number;
      }>()
      .create();

    type NeedsFooConstructorParams = ConstructorParameters<typeof NeedsFoo>[0];
    expectTypeOf<NeedsFooConstructorParams>().toMatchObjectType<{
      foo: string;
      bar?: number;
    }>();

    // @ts-expect-error missing required foo
    new NeedsFoo();
    // @ts-expect-error missing required foo
    new NeedsFoo({ bar: 1 });
    new NeedsFoo({ foo: 'hello' });
    new NeedsFoo({ foo: 'hello', bar: 1 });

    type NeedsFooInstance = InstanceType<typeof NeedsFoo>;
    expectTypeOf<NeedsFooInstance['foo']>().toEqualTypeOf<string>();
    expectTypeOf<NeedsFooInstance['bar']>().toEqualTypeOf<number | undefined>();
  });

  test('constructor input makes defaulted extra fields optional', () => {
    const needsFooBuilder = createTRPCFineGrainedError('BAD_REQUEST').data<{
      foo: string;
      bar: number;
    }>();
    const NeedsFoo = needsFooBuilder.create({
      defaults: {
        bar: 1,
      },
    });

    // @ts-expect-error unknown default key
    needsFooBuilder.create({ defaults: { baz: 1 } });

    type NeedsFooConstructorParams = ConstructorParameters<typeof NeedsFoo>[0];
    expectTypeOf<NeedsFooConstructorParams>().toMatchObjectType<{
      foo: string;
      bar?: number;
    }>();

    // @ts-expect-error missing required foo
    new NeedsFoo();
    // @ts-expect-error missing required foo
    new NeedsFoo({ bar: 1 });
    new NeedsFoo({ foo: 'hello' });
    new NeedsFoo({ foo: 'hello', bar: 1 });

    type NeedsFooInstance = InstanceType<typeof NeedsFoo>;
    expectTypeOf<NeedsFooInstance['foo']>().toEqualTypeOf<string>();
    expectTypeOf<NeedsFooInstance['bar']>().toEqualTypeOf<number>();
  });

  test('constants are removed from constructor input', () => {
    const needsFooBuilder = createTRPCFineGrainedError('BAD_REQUEST').data<{
      foo: string;
      bar: number;
    }>();
    const NeedsFoo = needsFooBuilder.create({
      constants: {
        bar: 1,
      },
    });

    // @ts-expect-error unknown constant key
    needsFooBuilder.create({ constants: { baz: 1 } });

    type NeedsFooConstructorParams = ConstructorParameters<typeof NeedsFoo>[0];
    expectTypeOf<NeedsFooConstructorParams>().toMatchObjectType<{
      foo: string;
    }>();

    // @ts-expect-error missing required foo
    new NeedsFoo();
    const err = new NeedsFoo({ foo: 'hello' });
    // @ts-expect-error constant bar is not part of constructor input
    new NeedsFoo({ foo: 'hello', bar: 1 });

    type NeedsFooInstance = InstanceType<typeof NeedsFoo>;
    expectTypeOf<NeedsFooInstance['foo']>().toEqualTypeOf<string>();
    expectTypeOf<NeedsFooInstance['bar']>().toEqualTypeOf<number>();
    expect(err.foo).toBe('hello');
    expect(err.bar).toBe(1);
    expect(err.toShape()).toEqual({
      code: -32600,
      message: 'BAD_REQUEST',
      data: {
        foo: 'hello',
        bar: 1,
      },
    });
  });

  test('defaults and constants compose correctly', () => {
    const needsFooBuilder = createTRPCFineGrainedError('BAD_REQUEST').data<{
      foo: string;
      bar: number;
      baz: 'CONST';
      ping: string;
    }>();
    const NeedsFoo = needsFooBuilder.create({
      defaults: {
        bar: 1,
        ping: 'pong',
      },
      constants: {
        baz: 'CONST',
        ping: 'pang',
      },
    });

    type NeedsFooConstructorParams = ConstructorParameters<typeof NeedsFoo>[0];
    expectTypeOf<NeedsFooConstructorParams>().toMatchObjectType<{
      foo: string;
      bar?: number;
    }>();

    // @ts-expect-error missing required foo
    new NeedsFoo();
    // @ts-expect-error constant baz is not part of constructor input
    new NeedsFoo({ foo: 'hello', baz: 'CONST' });

    const err1 = new NeedsFoo({ foo: 'hello' });
    const err2 = new NeedsFoo({ foo: 'hello', bar: 2 });

    expect(err1.foo).toBe('hello');
    expect(err1.bar).toBe(1);
    expect(err1.baz).toBe('CONST');
    expect(err1.toShape()).toEqual({
      code: -32600,
      message: 'BAD_REQUEST',
      data: {
        foo: 'hello',
        bar: 1,
        baz: 'CONST',
        ping: 'pang',
      },
    });

    expect(err2.foo).toBe('hello');
    expect(err2.bar).toBe(2);
    expect(err2.baz).toBe('CONST');
    expect(err2.toShape()).toEqual({
      code: -32600,
      message: 'BAD_REQUEST',
      data: {
        foo: 'hello',
        bar: 2,
        baz: 'CONST',
        ping: 'pang',
      },
    });
  });

  test('constructor becomes optional when all required data is defaulted', () => {
    const badPhoneErrorBuilder = createTRPCFineGrainedError(
      'UNAUTHORIZED',
    ).data<{
      reason: 'BAD_PHONE';
    }>();
    const BadPhoneError = badPhoneErrorBuilder.create({
      defaults: {
        reason: 'BAD_PHONE',
      },
    });

    // @ts-expect-error unknown default key
    badPhoneErrorBuilder.create({ defaults: { other: 'BAD_PHONE' } });

    type BadPhoneErrorConstructorParams = ConstructorParameters<
      typeof BadPhoneError
    >[0];
    expectTypeOf<BadPhoneErrorConstructorParams>().toMatchTypeOf<
      { reason?: 'BAD_PHONE' } | undefined
    >();

    const err1 = new BadPhoneError();
    const err2 = new BadPhoneError({});
    new BadPhoneError({ reason: 'BAD_PHONE' });
    expect(err1.reason).toBe('BAD_PHONE');
    expect(err2.reason).toBe('BAD_PHONE');
    expect(err1.toShape()).toEqual({
      code: -32001,
      message: 'UNAUTHORIZED',
      data: { reason: 'BAD_PHONE' },
    });
  });

  test('constructor becomes optional when all required data is constant', () => {
    const badPhoneErrorBuilder = createTRPCFineGrainedError(
      'UNAUTHORIZED',
    ).data<{
      reason: 'BAD_PHONE';
    }>();
    const BadPhoneError = badPhoneErrorBuilder.create({
      constants: {
        reason: 'BAD_PHONE',
      },
    });

    // @ts-expect-error unknown default key
    badPhoneErrorBuilder.create({ constants: { other: 'BAD_PHONE' } });

    type BadPhoneErrorConstructorParams = ConstructorParameters<
      typeof BadPhoneError
    >[0];
    expectTypeOf<BadPhoneErrorConstructorParams>().toMatchTypeOf<
      { reason?: 'BAD_PHONE' } | undefined
    >();

    new BadPhoneError();
    new BadPhoneError({});
    new BadPhoneError({ reason: 'BAD_PHONE' });
  });

  test('message can be used as data without colliding', () => {
    const MyError = createTRPCFineGrainedError('BAD_REQUEST')
      .data<{
        message: 'DETAIL';
      }>()
      .create({
        defaults: {
          message: 'DETAIL',
        },
      });

    const err = new MyError();
    expect(err.message).toBe('BAD_REQUEST');
    expect(err.toShape()).toEqual({
      code: -32600,
      message: 'BAD_REQUEST',
      data: { message: 'DETAIL' },
    });
  });

  test('constant message data does not collide with the error message', () => {
    const MyError = createTRPCFineGrainedError('BAD_REQUEST')
      .data<{
        message: 'DETAIL';
      }>()
      .create({
        constants: {
          message: 'DETAIL',
        },
      });

    const err = new MyError();
    expect(err.message).toBe('BAD_REQUEST');
    expect(err.toShape()).toEqual({
      code: -32600,
      message: 'BAD_REQUEST',
      data: { message: 'DETAIL' },
    });
  });
});
