// https://github.com/pomber/didact/blob/master/didact.js

/**
 * @callback FunctionComponent
 * @param {Props} props
 * @returns {ElementPOJO}
 */

/**
 * The element's properties, such as HTML attributes, event listeners, and any
 * other data. Props is the arg passed to components when they are invoked.
 * @typedef {Object} Props
 * @property {string} style Inline css style string.
 * @property {Array<ElementPOJO|FunctionComponent>} children
 * @property {any} nodeValue The value to be added to the DOM node.
 */

/**
 * A Plain Old JavaScript Object to represent an HTML element and children.
 * @typedef {Object} ElementPOJO
 * @property {string|Function} type The HTML element type or a functional
 *    component.
 * @property {Props} props The element's properties, such as HTML attributes,
 *    event listeners, and any other data. Props are passed to components as
 *    an arg.
 */

/**
 * @typedef {Object} BaseFiber
 * @property {Node} dom The corresponding DOM node.
 * @property {Fiber} parent This fiber's parent.
 * @property {Fiber} sibling This fiber's sibling.
 * @property {Fiber} child This fiber's child.
 * @property {Fiber} alternate The old fiber with this fiber's old data.
 * @property {'UPDATE'|'PLACEMENT'|'DELETION'} effectTag The type of rendering
 *    effect that needs to be committed. `PLACEMENT` is used when the node type
 *    changes and a new DOM node needs to be rendered.
 */

/**
 * The DOM is a tree structure. Trees contain wood fibers which are kind of
 * like a connective tissue.
 *
 * The DOM is virtually represented with a POJO tree structure. A `Fiber`,
 * connects the VDOM to the real DOM--each POJO element is related to it's
 * corresponding DOM node in the document that it represents. Updates can be
 * done to the POJO for better performance and to ensure the changes to the
 * VDOM will be reconciled to the DOM without pauses from user actions causing
 * partially complete re-renders to appear.
 *
 * The `Fiber` also contains references to the old `Fiber` so changes can be
 * derived from the differences, and also references to related `Fiber`s.
 * @typedef {ElementPOJO & BaseFiber} Fiber
 */

// Global vars so recursion can be paused and resume where it left off
// to prevent recursion from blocking the browser's handling of user events.

const Act = {
  createElement,
  render,
  useState,
};

function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === 'object' ? child : createTextElement(child)
      ),
    },
  };
}

function createTextElement(text) {
  return {
    type: 'TEXT_ELEMENT',
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

function createDom(fiber) {
  const dom =
    fiber.type == 'TEXT_ELEMENT'
      ? document.createTextNode('')
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);

  return dom;
}

const isEvent = (key) => key.startsWith('on');
const isProperty = (key) => key !== 'children' && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);
function updateDom(dom, prevProps, nextProps) {
  //Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // Remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = '';
    });

  // Set new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });

  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}

function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  currentRoot = wipRoot;
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) {
    return;
  }

  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === 'PLACEMENT' && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === 'UPDATE' && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === 'DELETION') {
    commitDeletion(fiber, domParent);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
}

function render(element, container) {
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

let nextUnitOfWork = null;
let currentRoot = null;
let wipRoot = null;
let deletions = null;

function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }

  requestIdleCallback(workLoop);
}

requestIdleCallback(workLoop);

function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}

let wipFiber = null;
let hookIndex = null;

function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

function useState(initial) {
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex];
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: [],
  };

  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });

  const setState = (action) => {
    hook.queue.push(action);
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  };

  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}

function updateHostComponent(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  reconcileChildren(fiber, fiber.props.children.flat());
}

function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;

  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;

    const sameType = oldFiber && element && element.type == oldFiber.type;

    if (sameType) {
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: 'UPDATE',
      };
    }
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: 'PLACEMENT',
      };
    }
    if (oldFiber && !sameType) {
      oldFiber.effectTag = 'DELETION';
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

function App(props) {
  return Act.createElement(
    'fieldset',
    {
      id: 'app',
      style: 'border: 5px solid purple; padding: 10px; margin: 10px;',
    },
    [Act.createElement('legend', null, 'App'), Counter()]
  );
}

function Counter({
  start = 0,
  title = 'Test Counter',
  subtitle = 'test subtitle ',
} = {}) {
  const [state, setState] = Act.useState(start);
  return Act.createElement(
    'fieldset',
    {
      style: 'border: 3px solid orange; padding: 5px',
      onClick: () => setState((n) => n + 1),
    },
    [
      Act.createElement('legend', null, 'Counter'),
      Act.createElement(
        'section',
        { style: 'border: 3px solid lightblue; padding: 5px;' },
        [
          Act.createElement('h1', { style: 'color: red;' }, title),
          Act.createElement(
            'p',
            { style: 'color: ' },
            subtitle,
            Act.createElement(
              'span',
              { style: 'color: orange; font-weight: bold;' },
              state
            )
          ),
        ]
      ),
    ]
  );
}

const container = document.getElementById('root');
// const counterElem = Act.createElement(Counter, { start: 5 });

const appElem = Act.createElement(App, {});

Act.render(appElem, container);
