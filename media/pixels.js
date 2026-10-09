// Pixel art for ErrorBuddy, drawn from text grids. No image files.
// Exposes window.ErrorBuddyPixels.mascot(name) and .icon(name), which return <svg> elements.
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // One letter per pixel. '.' is empty and 'c' takes the surrounding text colour.
  var PALETTE = {
    k: '#1b1b2f', // ink outline
    g: '#58c777', // Buddy's body
    d: '#3f9f5c', // body shade
    w: '#ffffff',
    t: '#c9ccd6', // light grey
    h: '#5b6170', // dark grey
    r: '#e5484d',
    o: '#f2762e',
    y: '#f0b429',
    b: '#3b6fd9',
    m: '#8b5cf6',
    n: '#7a4a21',
    s: '#c8a96a', // khaki
    c: 'currentColor'
  };

  // Buddy the bug, 16 x 16, in a costume for each personality.
  var MASCOTS = {
    idle: [
      '................',
      '...k........k...',
      '....k......k....',
      '....kkkkkkkk....',
      '...kggggggggk...',
      '..kggggggggggk..',
      '..kggggggggggk..',
      '..kgkkkggkkkgk..',
      '..kggggggggggk..',
      '..kggkggggkggk..',
      '..kgggkkkkgggk..',
      '..kddddddddddk..',
      '...kddddddddk...',
      '....kkkkkkkk....',
      '....kk....kk....',
      '................'
    ],
    pirate: [
      '................',
      '....kkkkkkkk....',
      '...kkkkwwkkkk...',
      '..kkkkkkkkkkkk..',
      '...krrrrrrrrk...',
      '..kggggggggggk..',
      '..kgkkkggwwkgk..',
      '..kgkkkggwwkgk..',
      '..kggggggggggk..',
      '..kggggggggkgk..',
      '..kgggkkkkkggk..',
      '..kddddddddddk..',
      '...kddddddddk...',
      '....kkkkkkkk....',
      '....kk....kk....',
      '................'
    ],
    sportscaster: [
      '................',
      '................',
      '....hhhhhhhh....',
      '...hkkkkkkkkh...',
      '..hkggggggggkh..',
      '..kggggggggggk..',
      '.hkgwwkggwwkgkh.',
      '.hkgwwkggwwkgkh.',
      '.hkggggggggggkh.',
      '..kggggkkggggkh.',
      '..kggggrrggghh..',
      '..kddddddddddk..',
      '...kddddddddk...',
      '....kkkkkkkk....',
      '....kk....kk....',
      '................'
    ],
    parent: [
      '................',
      '................',
      '..kk........kk..',
      '....kkkkkkkk....',
      '...kggggggggk...',
      '..kgbbbggbbbgk..',
      '..kbwwbbbwwbgk..',
      '..kbkwbbbkwbgk..',
      '..kgbbbggbbbgk..',
      '..kggggggggggk..',
      '..kgggkkkkgggk..',
      '..kddkddddkddk..',
      '...kddddddddk...',
      '....kkkkkkkk....',
      '....kk....kk....',
      '................'
    ],
    shakespeare: [
      '.........y......',
      '....mmmmmmyy....',
      '...mmmmmmmmmy...',
      '..kkkkkkkkkkkk..',
      '...kggggggggk...',
      '..kggggggggggk..',
      '..kgwwkggwwkgk..',
      '..kgwwkggwwkgk..',
      '..kggggggggggk..',
      '..kggnnnnnnggk..',
      '..kgggggnngggk..',
      '..wtwtwtwtwtwt..',
      '...twtwtwtwtw...',
      '....kkkkkkkk....',
      '....kk....kk....',
      '................'
    ],
    narrator: [
      '................',
      '.....ssssss.....',
      '....ssssssss....',
      '..nnnnnnnnnnnn..',
      '...kggggggggk...',
      '..kggggggggggk..',
      '..kgkkkggkkkgk..',
      '..kgwwkggwwkgk..',
      '..kggggggggggk..',
      '..kggggggggggk..',
      '..kggggkkggggk..',
      '..kddddddddddk..',
      '...kddddddddk...',
      '....kkkkkkkk....',
      '....kk....kk....',
      '................'
    ]
  };

  // Small icons, 8 x 8.
  var ICONS = {
    flame: [
      '....o...',
      '...oo...',
      '..ooo.o.',
      '.oooyoo.',
      '.ooyyoo.',
      '.oyyyyo.',
      '.oyyyyo.',
      '..oooo..'
    ],
    bolt: [
      '....cc..',
      '...cc...',
      '..cc....',
      '.ccccc..',
      '...cc...',
      '..cc....',
      '.cc.....',
      '.c......'
    ],
    trophy: [
      '.yyyyyy.',
      'yyyyyyyy',
      'y.yyyy.y',
      '.yyyyyy.',
      '..yyyy..',
      '...yy...',
      '..nnnn..',
      '.nnnnnn.'
    ],
    moon: [
      '..ccc...',
      '.ccc....',
      'ccc.....',
      'ccc.....',
      'ccc....c',
      'cccc..cc',
      '.cccccc.',
      '..cccc..'
    ],
    semicolon: [
      '........',
      '...bb...',
      '...bb...',
      '........',
      '...bb...',
      '...bb...',
      '....b...',
      '...b....'
    ],
    person: [
      '..cccc..',
      '..cccc..',
      '..cccc..',
      '...cc...',
      '.cccccc.',
      'cccccccc',
      'cccccccc',
      'cccccccc'
    ],
    lock: [
      '..cccc..',
      '.c....c.',
      '.c....c.',
      'cccccccc',
      'cccccccc',
      'ccc..ccc',
      'cccccccc',
      'cccccccc'
    ],
    check: [
      '........',
      '.......g',
      '......gg',
      'g....gg.',
      'gg..gg..',
      '.gggg...',
      '..gg....',
      '........'
    ]
  };

  // Draws a grid as an SVG, one <rect> per run of same-coloured pixels.
  function render(rows, className) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + rows[0].length + ' ' + rows.length);
    svg.setAttribute('class', 'px ' + className);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('aria-hidden', 'true');

    rows.forEach(function (row, y) {
      var x = 0;
      while (x < row.length) {
        var key = row[x];
        var start = x;
        while (x < row.length && row[x] === key) {
          x++;
        }
        if (PALETTE[key]) {
          var rect = document.createElementNS(SVG_NS, 'rect');
          rect.setAttribute('x', String(start));
          rect.setAttribute('y', String(y));
          rect.setAttribute('width', String(x - start));
          rect.setAttribute('height', '1');
          rect.setAttribute('fill', PALETTE[key]);
          svg.appendChild(rect);
        }
      }
    });
    return svg;
  }

  window.ErrorBuddyPixels = {
    hasMascot: function (name) {
      return Object.prototype.hasOwnProperty.call(MASCOTS, name);
    },
    mascot: function (name) {
      return render(MASCOTS[name] || MASCOTS.idle, 'px-mascot');
    },
    icon: function (name) {
      return render(ICONS[name] || ICONS.trophy, 'px-icon');
    },
    sprites: { mascots: MASCOTS, icons: ICONS }
  };
})();
