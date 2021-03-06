'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import invariant from 'assert';
import path from 'path';
import Console from './Console';
import {Dropdown} from '../../../nuclide-ui/lib/Dropdown';
import {PanelComponent} from '../../../nuclide-ui/lib/PanelComponent';
import {Toolbar} from '../../../nuclide-ui/lib/Toolbar';
import {ToolbarLeft} from '../../../nuclide-ui/lib/ToolbarLeft';
import {ToolbarRight} from '../../../nuclide-ui/lib/ToolbarRight';
import {Checkbox} from '../../../nuclide-ui/lib/Checkbox';
import {
  Button,
  ButtonSizes,
  ButtonTypes,
} from '../../../nuclide-ui/lib/Button';
import {createPaneContainer} from '../../../nuclide-atom-helpers';
import {React, ReactDOM} from 'react-for-atom';
import TestClassTree from './TestClassTree';

type State = {
  selectedTestRunnerIndex: number;
};

class TestRunnerPanel extends React.Component {
  state: State;
  _paneContainer: Object;
  _leftPane: atom$Pane;
  _rightPane: atom$Pane;
  _textEditorModel: TextEditor;
  _tree: TestClassTree;

  // Bound Functions for use as callbacks.
  setSelectedTestRunnerIndex: Function;

  static propTypes = {
    attachDebuggerBeforeRunning: React.PropTypes.bool,
    buffer: React.PropTypes.object.isRequired,
    executionState: React.PropTypes.number.isRequired,
    onClickClear: React.PropTypes.func.isRequired,
    onClickClose: React.PropTypes.func.isRequired,
    onClickRun: React.PropTypes.func.isRequired,
    onClickStop: React.PropTypes.func.isRequired,
    onDebuggerCheckboxChanged: React.PropTypes.func,
    path: React.PropTypes.string,
    progressValue: React.PropTypes.number,
    runDuration: React.PropTypes.number,
    // TODO: Should be `arrayOf(TestRunner)`, but that would require a real object since this is
    // runtime code for React.
    testRunners: React.PropTypes.arrayOf(Object).isRequired,
    testSuiteModel: React.PropTypes.object,
  };

  static ExecutionState = Object.freeze({
    RUNNING: 0,
    STOPPED: 1,
  });

  constructor(props: Object) {
    super(props);
    this.state = {
      roots: [],
      // If there are test runners, start with the first one selected. Otherwise store -1 to
      // later indicate there were no active test runners.
      selectedTestRunnerIndex: props.testRunners.length > 0 ? 0 : -1,
    };

    // Bind Functions for use as callbacks;
    // TODO: Replace with property initializers when supported by Flow;
    this.setSelectedTestRunnerIndex = this.setSelectedTestRunnerIndex.bind(this);
  }

  componentDidMount() {
    this._paneContainer = createPaneContainer();
    this._leftPane = this._paneContainer.getActivePane();
    this._rightPane = this._leftPane.splitRight({
      // Prevent Atom from cloning children on splitting; this panel wants an empty container.
      copyActiveItem: false,
      // Make the right pane 2/3 the width of the parent since console output is generally wider
      // than the test tree.
      flexScale: 2,
    });

    this.renderTree();
    this.renderConsole();

    ReactDOM.findDOMNode(this.refs['paneContainer']).appendChild(
      atom.views.getView(this._paneContainer)
    );
  }

  componentDidUpdate() {
    this.renderTree();
  }

  componentWillReceiveProps(nextProps: Object) {
    const currSelectedIndex = this.state.selectedTestRunnerIndex;
    if (currSelectedIndex === -1 && nextProps.testRunners.length > 0) {
      this.setState({selectedTestRunnerIndex: 0});
    } else if (nextProps.testRunners.length === 0 && currSelectedIndex >= 0) {
      this.setState({selectedTestRunnerIndex: -1});
    }
  }

  componentWillUnmount() {
    ReactDOM.unmountComponentAtNode(
      atom.views.getView(this._rightPane).querySelector('.item-views'));
    ReactDOM.unmountComponentAtNode(
      atom.views.getView(this._leftPane).querySelector('.item-views'));
    this._paneContainer.destroy();
  }

  render() {
    let runStopButton;
    switch (this.props.executionState) {
      case TestRunnerPanel.ExecutionState.RUNNING:
        runStopButton = (
          <Button
            icon="primitive-square"
            buttonType={ButtonTypes.ERROR}
            onClick={this.props.onClickStop}>
            Stop
          </Button>
        );
        break;
      case TestRunnerPanel.ExecutionState.STOPPED:
        const initialTest = this.props.path === undefined;
        runStopButton = (
          <Button
            icon={initialTest ? 'playback-play' : 'sync'}
            buttonType={ButtonTypes.PRIMARY}
            disabled={this.isDisabled()}
            onClick={this.props.onClickRun}>
            {initialTest ? 'Test' : 'Re-Test'}
          </Button>
        );
        break;
    }

    // Assign `value` only when needed so a null/undefined value will show an indeterminate
    // progress bar.
    let progressAttrs: ?{[key: string]: mixed} = undefined;
    if (this.props.progressValue) {
      // `key` is set to force React to treat this as a new element when the `value` attr should be
      // removed. Currently it just sets `value="0"`, which is styled differently from no `value`
      // attr at all.
      // TODO: Remove the `key` once https://github.com/facebook/react/issues/1448 is resolved.
      progressAttrs = {
        key: 1,
        value: this.props.progressValue,
      };
    }

    let runMsg;
    if (this.props.executionState === TestRunnerPanel.ExecutionState.RUNNING) {
      runMsg = (
        <span className="inline-block">Running</span>
      );
    } else if (this.props.runDuration) {
      runMsg = (
        <span className="inline-block">Done (in {this.props.runDuration / 1000}s)</span>
      );
    }

    let pathMsg;
    if (this.props.path) {
      pathMsg = <span title={this.props.path}>{path.basename(this.props.path)}</span>;
    }

    let dropdown;
    if (this.isDisabled()) {
      dropdown = <span className="inline-block text-warning">No registered test runners</span>;
    } else {
      dropdown = (
        <Dropdown
          className="inline-block nuclide-test-runner__runner-dropdown"
          disabled={this.props.executionState === TestRunnerPanel.ExecutionState.RUNNING}
          menuItems={this.props.testRunners.map(testRunner =>
            ({label: testRunner.label, value: testRunner.label})
          )}
          onSelectedChange={this.setSelectedTestRunnerIndex}
          ref="dropdown"
          selectedIndex={this.state.selectedTestRunnerIndex}
          size="sm"
          title="Choose a test runner"
        />
      );
    }

    let attachDebuggerCheckbox = null;
    if (this.props.attachDebuggerBeforeRunning != null) {
      attachDebuggerCheckbox = (
        <Checkbox
          checked={this.props.attachDebuggerBeforeRunning}
          label="Enable Debugger"
          onChange={this.props.onDebuggerCheckboxChanged}
        />
      );
    }

    return (
      <PanelComponent dock="bottom">
        <div className="nuclide-test-runner-panel">
          <Toolbar location="top">
            <ToolbarLeft>
              {dropdown}
              {runStopButton}
              {attachDebuggerCheckbox}
              <Button
                size={ButtonSizes.SMALL}
                icon="trashcan"
                className="trashcan inline-block"
                disabled={this.isDisabled() ||
                  this.props.executionState === TestRunnerPanel.ExecutionState.RUNNING}
                onClick={this.props.onClickClear}
                title="Clear Output">
              </Button>
              {pathMsg}
            </ToolbarLeft>
            <ToolbarRight>
              {runMsg}
              <progress className="inline-block" max="100" {...progressAttrs} />
              <Button
                onClick={this.props.onClickClose}
                className="inline-block"
                icon="x"
                size={ButtonSizes.SMALL}
                title="Close Panel">
              </Button>
            </ToolbarRight>
          </Toolbar>
          <div className="nuclide-test-runner-console" ref="paneContainer"></div>
        </div>
      </PanelComponent>
    );
  }

  isDisabled(): boolean {
    return this.props.testRunners.length === 0;
  }

  setSelectedTestRunnerIndex(selectedTestRunnerIndex: number): void {
    this.setState({selectedTestRunnerIndex});
  }

  getSelectedTestRunner(): ?Object {
    const selectedTestRunnerIndex = this.state.selectedTestRunnerIndex;
    if (selectedTestRunnerIndex >= 0) {
      return this.props.testRunners[selectedTestRunnerIndex];
    }
  }

  renderTree() {
    const component = ReactDOM.render(
      <TestClassTree
        isRunning={this.props.executionState === TestRunnerPanel.ExecutionState.RUNNING}
        testSuiteModel={this.props.testSuiteModel}
      />,
      atom.views.getView(this._leftPane).querySelector('.item-views')
    );
    invariant(component instanceof TestClassTree);
    this._tree = component;
  }

  renderConsole() {
    ReactDOM.render(
      <Console textBuffer={this.props.buffer} />,
      atom.views.getView(this._rightPane).querySelector('.item-views')
    );
  }
}

module.exports = TestRunnerPanel;
