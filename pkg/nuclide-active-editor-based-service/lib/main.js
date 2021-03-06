'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import {Disposable} from 'atom';
import {Observable} from 'rxjs';

import {
  atomEventDebounce,
} from '../../nuclide-atom-helpers';

import {event as commonsEvent, cacheWhileSubscribed} from '../../nuclide-commons';

import {getLogger} from '../../nuclide-logging';
const logger = getLogger();

import {ProviderRegistry} from './ProviderRegistry';

export type Provider = {
  priority: number;
  grammarScopes: Array<string>;
  // This overrides the updateOnEdit setting in ActiveEditorBasedService's config.
  updateOnEdit?: boolean;
};

export type Result<V> = {
  kind: 'not-text-editor';
} | {
  kind: 'no-provider';
  grammar: atom$Grammar;
} | {
  kind: 'provider-error';
} | {
  // Since providers can be slow, the pane-change and edit events are emitted immediately in case
  // the UI needs to clear outdated results.
  kind: 'pane-change';
} | {
  kind: 'edit';
} | {
  kind: 'save';
} | {
  kind: 'result';
  result: V;
  // The editor that the result was computed from
  editor: atom$TextEditor;
};

export type ResultFunction<T, V> = (provider: T, editor: atom$TextEditor) => Promise<V>;

export type EventSources = {
  activeEditors: Observable<?atom$TextEditor>;
  changesForEditor: (editor: atom$TextEditor) => Observable<void>;
  savesForEditor: (editor: atom$TextEditor) => Observable<void>;
};

export type Config = {
  /**
   * If true, we will query providers for updates whenever the text in the editor is changed.
   * Otherwise, we will query only when there is a save event.
   */
  updateOnEdit?: boolean;
};

type ConcreteConfig = {
  updateOnEdit: boolean;
};

const DEFAULT_CONFIG: ConcreteConfig = {
  updateOnEdit: true,
};

function getConcreteConfig(config: Config): ConcreteConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
  };
}

export class ActiveEditorBasedService<T: Provider, V> {
  _resultFunction: ResultFunction<T, V>;
  _providerRegistry: ProviderRegistry<T>;
  _resultsStream: Observable<Result<V>>;
  _config: ConcreteConfig;

  constructor(
    resultFunction: ResultFunction<T, V>,
    config: Config = {},
    eventSources: EventSources = getDefaultEventSources(),
  ) {
    this._config = getConcreteConfig(config);
    this._resultFunction = resultFunction;
    this._providerRegistry = new ProviderRegistry();
    this._resultsStream = this._createResultsStream(eventSources);
  }

  consumeProvider(provider: T): IDisposable {
    this._providerRegistry.addProvider(provider);
    return new Disposable(() => {
      this._providerRegistry.removeProvider(provider);
    });
  }

  getResultsStream(): Observable<Result<V>> {
    return this._resultsStream;
  }

  _createResultsStream(eventSources: EventSources): Observable<Result<V>> {
    const results = eventSources.activeEditors.switchMap(editorArg => {
      // Necessary so the type refinement holds in the callback later
      const editor = editorArg;
      if (editor == null) {
        return Observable.of({kind: 'not-text-editor'});
      }

      return Observable.concat(
        // Emit a pane change event first, so that clients can do something while waiting for a
        // provider to give a result.
        Observable.of({kind: 'pane-change'}),
        Observable.fromPromise(this._getResultForEditor(
          this._getProviderForEditor(editor),
          editor,
        )),
        this._resultsForEditor(editor, eventSources),
      );
    });
    return cacheWhileSubscribed(results);
  }

  _resultsForEditor(editor: atom$TextEditor, eventSources: EventSources): Observable<Result<V>> {
    // It's possible that the active provider for an editor changes over time.
    // Thus, we have to subscribe to both edits and saves.
    return Observable.merge(
      eventSources.changesForEditor(editor)
        .map(() => 'edit'),
      eventSources.savesForEditor(editor)
        .map(() => 'save'),
    ).flatMap(event => {
      const provider = this._getProviderForEditor(editor);
      if (provider != null) {
        let updateOnEdit = provider.updateOnEdit;
        // Fall back to the config's updateOnEdit if not provided.
        if (updateOnEdit == null) {
          updateOnEdit = this._config.updateOnEdit;
        }
        if (updateOnEdit !== (event === 'edit')) {
          return Observable.empty();
        }
      }
      return Observable.concat(
        // $FlowIssue: {kind: edit | save} <=> {kind: edit} | {kind: save}
        Observable.of({kind: event}),
        Observable.fromPromise(this._getResultForEditor(provider, editor)),
      );
    });
  }

  _getProviderForEditor(editor: atom$TextEditor): ?T {
    const grammar = editor.getGrammar().scopeName;
    return this._providerRegistry.findProvider(grammar);
  }

  async _getResultForEditor(provider: ?T, editor: atom$TextEditor): Promise<Result<V>> {
    if (provider == null) {
      return {
        kind: 'no-provider',
        grammar: editor.getGrammar(),
      };
    }
    try {
      return {
        kind: 'result',
        result: await this._resultFunction(provider, editor),
        editor,
      };
    } catch (e) {
      logger.error(`Error from provider for ${editor.getGrammar()}`, e);
      return {
        kind: 'provider-error',
      };
    }
  }
}

function getDefaultEventSources(): EventSources {
  return {
    activeEditors: atomEventDebounce.observeActiveEditorsDebounced(),
    changesForEditor: editor => atomEventDebounce.editorChangesDebounced(editor),
    savesForEditor: editor => {
      return commonsEvent.observableFromSubscribeFunction(callback => editor.onDidSave(callback))
        .mapTo(undefined);
    },
  };
}
