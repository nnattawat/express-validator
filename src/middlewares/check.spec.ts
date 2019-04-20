import { ContextHandlerImpl, SanitizersImpl, ValidatorsImpl } from '../chain';
import { InternalRequest } from '../base';
import { Context } from '../context';
import { SelectFields, Sanitize, PersistBack, EnsureInstance, RemoveOptionals, Validate, ContextRunner, FieldInstance } from '../context-runners';
import { defaultRunners, check } from './check';

// Some tests might change the list of runners, so we keep the original list and reset it afterwards
const originalRunners = defaultRunners.slice();
const overrideRunners = (newRunners: ({ new(): ContextRunner })[]) => {
  defaultRunners.splice(0, defaultRunners.length, ...newRunners);
};
afterEach(() => {
  overrideRunners(originalRunners);
});

it('has a default list of runners', () => {
  expect(defaultRunners).toEqual([
    SelectFields,
    Sanitize,
    RemoveOptionals,
    EnsureInstance,
    PersistBack,
    Validate,
  ]);
});

it('has context handler methods', () => {
  const chain = check('foo');
  Object.keys(ContextHandlerImpl.prototype).forEach(method => {
    expect(chain).toHaveProperty(method);
    expect(typeof (chain as any)[method]).toBe('function');
  });
});

it('has sanitizer methods', () => {
  const chain = check('foo');
  Object.keys(SanitizersImpl.prototype).forEach(method => {
    expect(chain).toHaveProperty(method);
    expect(typeof (chain as any)[method]).toBe('function');
  });
});

it('has validator methods', () => {
  const chain = check('foo');
  Object.keys(ValidatorsImpl.prototype).forEach(method => {
    expect(chain).toHaveProperty(method);
    expect(typeof (chain as any)[method]).toBe('function');
  });
});

it('runs the default runners', done => {
  const selectedFields: FieldInstance[] = [{
    path: 'foo',
    originalPath: 'foo',
    location: 'body',
    value: 123,
    originalValue: 123,
  }];

  const runA = jest.fn().mockResolvedValue(selectedFields);
  const runB = jest.fn().mockResolvedValue([]);
  overrideRunners([class { run = runA; }, class { run = runB; }]);

  const req = {
    body: { foo: 123 },
  };
  const middleware = check(['foo', 'bar'], ['body'], 'message');
  middleware(req, {}, () => {
    expect(runA).toHaveBeenCalledWith(req, expect.any(Context), []);
    expect(runB).toHaveBeenCalledWith(req, expect.any(Context), selectedFields);

    expect(runA.mock.calls[0][1]).toBe(runB.mock.calls[0][1]);
    expect(runA.mock.calls[0][1]).toEqual(new Context(
      ['foo', 'bar'],
      ['body'],
      'message',
    ));

    done();
  });
});

it('sets validation errors thrown by a runner and stops', done => {
  const errorsA = [{
    location: 'body',
    param: 'foo',
    value: 123,
    msg: 'failed',
  }];
  const runA = jest.fn().mockRejectedValue(errorsA);
  const runB = jest.fn();
  overrideRunners([class { run = runA; }, class { run = runB; }]);

  const req: InternalRequest = {};
  check('foo')(req, {}, () => {
    expect(req._validationErrors).toEqual(errorsA);
    expect(runB).not.toHaveBeenCalled();

    done();
  });
});

it('concats to validation errors thrown by previous chains', done => {
  const errorsA = [{
    location: 'body',
    param: 'foo',
    value: 123,
    msg: 'failed',
  }];
  const errorsB = [{
    location: 'body',
    param: 'bar',
    value: 456,
    msg: 'failed',
  }];

  // First chain: it throws. Second chain: it succeeds
  const runA = jest.fn()
    .mockRejectedValueOnce(errorsA)
    .mockResolvedValueOnce([]);

  // First chain will not run this. Only the second one, because runA will succeed.
  const runB = jest.fn().mockRejectedValue(errorsB);

  overrideRunners([class { run = runA; }, class { run = runB; }]);

  const req: InternalRequest = {};
  check('foo')(req, {}, () => {
    check('bar')(req, {}, () => {
      expect(req._validationErrors).toEqual(errorsA.concat(errorsB));

      done();
    });
  });
});

it('passes unexpected errors down to other middlewares', done => {
  const error = new Error();
  overrideRunners([class { run = jest.fn().mockRejectedValue(error); }]);

  check('foo')({}, {}, (err?: Error) => {
    expect(err).toBe(error);
    done();
  });
});