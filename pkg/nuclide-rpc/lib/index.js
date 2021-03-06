'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

export {ServerComponent} from './ServerComponent';
export {ClientComponent} from './ClientComponent';
export {ClientConnection} from './ClientConnection';
export {LoopbackTransports} from './LoopbackTransports';

export type ConfigEntry = {
  name: string;
  definition:string;
  implementation: string;
};

export type Transport = {
  send(data: Object): void;
  onMessage(callback: (message: Object) => mixed): IDisposable;
  close(): void;
};
