'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {Outline} from '../../nuclide-outline-view';

import {pythonTextToOutline} from './outline';
import {getShowGlobalVariables} from './config';

export class PythonOutlineProvider {
  async getOutline(editor: atom$TextEditor): Promise<?Outline> {
    return pythonTextToOutline(getShowGlobalVariables(), editor.getText());
  }
}
