const SPARQL_ENDPOINT = 'https://data.adamlink.nl/_api/datasets/menno/alles/services/alles/sparql'
// const SPARQL_ENDPOINT = 'https://data.adamlink.nl/AdamNet/all/services/endpoint'
const SPARQL_HREF = 'https://data.adamlink.nl/AdamNet/all/services/endpoint'

const PREFIXES = `PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX sem: <http://semanticweb.cs.vu.nl/2009/11/sem/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
`.trim()

PERIOD_BOUNDS = {
  start: 1550,
  end: (new Date()).getFullYear()
}

function createMapsQuery (data) {
  const round = (num) => Math.round(num * 100000) / 100000

  let collectionsFilter = ''
  if (data.collections.length === 1) {
    collectionsFilter = `?map dct:provenance "${data.collections[0]}"^^xsd:string .\n`
  } else if (data.collections.length > 1) {
    const strings = `${data.collections.map(collection => `    "${collection}"^^xsd:string`).join(',\n')}`
    collectionsFilter = `\n  FILTER (?provenance IN (\n${strings})\n  ) .`
  }

  let creatorFilter = ''
  if (data.creator.length > 1) {
    // Escape double quotes
    const regex = data.creator.replace(/\\([\s\S])|(")/g, '\\$1$2')
    creatorFilter = `FILTER REGEX(?creator, "${regex}", "i") .`
  }

  return `${PREFIXES}

SELECT ?map ?img ?title ?provenance ?creator ?begin {
  ?map dct:spatial ?spatial .
  ?map foaf:depiction ?img .
  ?map dc:title ?title .
  ?map dct:provenance ?provenance .
  ?map dc:creator ?creator .
  ?map sem:hasBeginTimeStamp ?begin .

  ?spatial dc:type "outline"^^xsd:string .
  ?spatial geo:hasGeometry/geo:asWKT ?wkt .
  ?spatial wdt:P2046 ?km2 .
  ${collectionsFilter}
  ${creatorFilter}
  FILTER (year(xsd:dateTime(?begin)) >= ${data.period.start}) .
  FILTER (year(xsd:dateTime(?begin)) <= ${data.period.end}) .
  bind (bif:st_geomfromtext("POINT(${round(data.coordinates.lng)} ${round(data.coordinates.lat)})") as ?point)
  bind (bif:st_geomfromtext(?wkt) as ?outline)
  FILTER (bif:st_intersects(?point, ?outline))
}
ORDER BY ASC(?km2)
LIMIT 25`.trim()
}

function createCollectionsQuery () {
  return `${PREFIXES}

SELECT DISTINCT ?provenance (COUNT(?map) AS ?count) WHERE {
  ?map dct:spatial ?spatial .
  ?map foaf:depiction ?img .
  ?map dc:title ?title .
  ?map sem:hasBeginTimeStamp ?begin .
  ?map dct:provenance ?provenance .

  ?spatial dc:type "outline"^^xsd:string .
  ?spatial geo:hasGeometry/geo:asWKT ?wkt .
  ?spatial wdt:P2046 ?km2 .
}
GROUP BY ?provenance
ORDER BY DESC(?count)
LIMIT 100
`.trim()
}

function executeQuery (query) {
  const queryString = m.buildQueryString({
    query
  })

  return fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    body: queryString,
    json: true,
    headers: {
      'Accept': 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    }
  })
    .catch((err) => console.error('Executing query failed', err))
    .then((response) => response.json())
    .then((json) => json.results.bindings)
    .catch((err) => console.error('Parsing results failed', err))
}

const RangeSlider = {
  value: undefined,
  oncreate: (vnode) => Object.assign(vnode.state, {
    value: vnode.attrs.value
  }),
  view: (vnode) => m('div', {
    class: 'range-slider'
  }, [
    m('label', {
      for: `range-slider-${vnode.attrs.id}`
    }, `${vnode.attrs.label} ${vnode.attrs.value}`),
    m('input', {
      id: `range-slider-${vnode.attrs.id}`,
      type: 'range',
      min: vnode.attrs.start,
      max: vnode.attrs.end,
      value: vnode.attrs.value,
      oninput: (event) => {
        const value = parseInt(event.target.value)
        vnode.attrs.valueChanged(value)
      }
    })
  ])
}

const CollectionsSelect = {
  collections: undefined,
  view: (vnode) => [
    m('fieldset', {
      id: 'form-collections',
      onchange: (event) => {
        const checkBoxes = document.querySelectorAll('input[name=form-collections-checkbox]:checked')
        const values = Array.prototype.map.call(checkBoxes, (checkbox) => checkbox.value)

        vnode.attrs.collectionsUpdated(values)
      }
    }, vnode.state.collections && vnode.state.collections.map((collection, index) =>
      m('div', [
        m('input', {
          type: 'checkbox',
          name: 'form-collections-checkbox',
          id: `form-collections-checkbox-${index}`,
          value: collection.provenance.value
        }),
        m('label', {
          for: `form-collections-checkbox-${index}`,
        }, [
          m('span', collection.provenance.value),
          m('span', {
            class: 'form-collections-map-count'
          }, `${collection.count.value} ${parseInt(collection.count.value) === 1 ? 'kaart' : 'kaarten'}`)
        ])
      ])
    ))
  ],
  oncreate: (vnode) => {
    const query = createCollectionsQuery()
    executeQuery(query)
      .then((collections) => {
        Object.assign(vnode.state, {collections})
        m.redraw()
      })
  }
}

const ExecuteButton = {
  view: (vnode) => m('button', {
    type: 'submit',
    onclick: (event) => {
      if (vnode.attrs.onclick) {
        vnode.attrs.onclick(event)
      }
    }
  }, '▶ Voer query uit')
}

const GeoIntersects = {
  view: (vnode) => m('div', {
    id: 'map-container'
  }, [
    m(Map, {
      moveEnd: vnode.attrs.coordinatesUpdated
    }),
    m('div', {
      class: 'map-crosshair'
    }, [
      m('img', {
        src: 'images/crosshair.svg'
      })
    ])
  ])
}

const Form = {
  view: (vnode) => m('li', [
    m('h2', 'Parameters'),
    m('form', {
      onsubmit: (event) => {
        event.preventDefault()
        vnode.attrs.executeMapsQuery()
      }
    }, [
      m('div', [
        m('label', {
          for: 'form-collections',
          class: 'filter-label'
        }, 'Laat kaarten uit deze collecties zien:'),
        m('div', {
          class: 'filter'
        }, [
          m(CollectionsSelect, {
            collectionsUpdated: (collections) => {
              vnode.attrs.data.collections = collections
              vnode.attrs.formUpdated(vnode.attrs.data)
            }
          })
        ])
      ]),
      m('div', [
        m('label', {
          class: 'filter-label'
        }, 'Laat kaarten van deze maker zien:'),
        m('div', {
          class: 'filter'
        }, [
          m('input', {
            value: vnode.attrs.data.creator,
            type: 'text',
            oninput: (event) => {
              const value = event.target.value
              vnode.attrs.data.creator = value
              vnode.attrs.formUpdated(vnode.attrs.data)
            },
            placeHolder: 'Zoek op exacte tekst, of gebruik een reguliere expressie'
          })
        ])
      ]),
      m('div', [
        m('label', {
          class: 'filter-label'
        }, 'Laat kaarten zien uit deze periode:'),
        m('div', {
          id: 'period-filter',
          class: 'filter'
        }, [
          m(RangeSlider, {
            id: 'start',
            label: 'Van',
            start: PERIOD_BOUNDS.start,
            end: PERIOD_BOUNDS.end,
            value: vnode.attrs.data.period.start,
            valueChanged: (value) => {
             vnode.attrs.data.period.start = value
             if (vnode.attrs.data.period.end < value) {
               vnode.attrs.data.period.end = value
             }
             vnode.attrs.formUpdated(vnode.attrs.data)
            }
          }),
          m(RangeSlider, {
            id: 'end',
            label: '; tot',
            start: PERIOD_BOUNDS.start,
            end: PERIOD_BOUNDS.end,
            value: vnode.attrs.data.period.end,
            valueChanged: (value) => {
              vnode.attrs.data.period.end = value
              if (vnode.attrs.data.period.start > value) {
                vnode.attrs.data.period.start = value
              }
              vnode.attrs.formUpdated(vnode.attrs.data)
            }
          })
        ])
      ]),
      m('div', [
        m('label', {
          class: 'filter-label'
        }, 'Laat kaarten zien die het midden van onderstaande kaart doorkruisen:'),
        m('div', {
          class: 'filter'
        }, [
          m(GeoIntersects, {
            coordinatesUpdated: (coordinates) => {
              vnode.attrs.data.coordinates = {
                lat: coordinates.lat,
                lng: coordinates.lng
              }
              vnode.attrs.formUpdated(vnode.attrs.data)
              m.redraw()
            }
          })
        ])
      ]),
      m('div', {
        class: 'section-footer',
      }, [
        m(ExecuteButton)
      ])
    ])
  ])
}

const Map = {
  view: () => m('div', {
    id: 'map'
  }),
  oncreate: (vnode) => {
    const map = L.map('map').setView([52.37064, 4.90047], 14)

    L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map)

    map.on('moveend', (event) => {
      if (vnode.attrs.moveEnd) {
        vnode.attrs.moveEnd(map.getCenter())
      }
    })
  }
}

const Sparql = {
  data: {
    editor: undefined
  },
  view: (vnode) => m('li', [
    m('h2', 'SPARQL-query'),
    m('textarea', {
      id: 'sparql-query'
    }, createMapsQuery(vnode.attrs.data)),
    m('div', {
      class: 'section-footer'
    }, [
      m('a', {
        target: '_blank',
        href: `${SPARQL_HREF}#query=${encodeURIComponent(createMapsQuery(vnode.attrs.data))}&` +
        `contentTypeConstruct=text%2Fturtle&contentTypeSelect=application%2Fsparql-results%2Bjson&` +
        `endpoint=${encodeURIComponent(SPARQL_ENDPOINT)}&requestMethod=POST&tabTitle=Query&` +
        `headers=%7B%7D&outputFormat=table`
      }, 'Open query in AdamLink'),
      m(ExecuteButton, {
        onclick: () => {
          vnode.attrs.executeMapsQuery()
        }
      })
    ])
  ]),
  oncreate: (vnode) => {
    const element = document.getElementById('sparql-query')

    const editor = CodeMirror.fromTextArea(element, {
      lineNumbers: true,
      readOnly: true,
      mode: 'sparql',
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
    })

    editor.foldCode(CodeMirror.Pos(0, 0))
    vnode.state.data.editor = editor
  },
  onupdate: (vnode) => {
    const editor = vnode.state.data.editor
    editor.setValue(createMapsQuery(vnode.attrs.data))
    editor.foldCode(CodeMirror.Pos(0, 0))
  }
}

function renderResults (data, executeMapsQuery) {
  if (data && data.length) {
    return m('ol', {
      id: 'results'
    }, data.map((result) => m('li', [
      m('div', {
        class: 'result-values'
      }, [
        m('h3', {
          class: 'truncate',
          title: result.title.value
        }, result.title.value),
        m('span', result.begin.value.slice(0, 4))
      ]),
      m('div', {
        class: 'result-values'
      }, [
        m('span', {
          class: 'truncate',
        }, result.provenance.value),
        m('span', {
          class: 'truncate'
        }, result.creator.value)
      ]),
      m('a', {
        href: result.map.value
      }, [
        m('img', {
          src: result.img.value
        })
      ])
    ])))
  } else {
    return m('p', [
      m('span', 'Geen resultaten; '),
      m(ExecuteButton, {
        onclick: () => {
          executeMapsQuery()
        }
      }),
      m('span', ' of pas parameters aan.')
    ])
  }
}

const Results =  {
  view: (vnode) => m('li', [
    m('h2', 'Resultaten'),
    renderResults(vnode.attrs.data, vnode.attrs.executeMapsQuery)
  ])
}

function executeMapsQuery (vnode) {
  const query = createMapsQuery(vnode.state.data.form)
  executeQuery(query)
    .then((results) => {
      Object.assign(vnode.state.data, {results})
      m.redraw()
    })
}

const App = {
  data: {
    results: undefined,
    form: {
      period: Object.assign({}, PERIOD_BOUNDS),
      coordinates: {
        lat: 52.37064,
        lng: 4.90047
      },
      collections: [],
      creator: ''
    }
  },
  view: (vnode) => ([
    m('header', [
      m('img', {
        src: 'images/header.jpg'
      }),
      m('h1', 'Kaart-SPARQL')
    ]),
    m('main', [
      m('p', 'Hier komt de introductie!'),
      m('ol', {
        class: 'sections'
      }, [
        m(Form, {
          data: vnode.state.data.form,
          formUpdated: (form) => Object.assign(vnode.state.data, form),
          executeMapsQuery: () => executeMapsQuery(vnode)
        }),
        m(Sparql, {
          data: vnode.state.data.form,
          executeMapsQuery: () => executeMapsQuery(vnode)
        }),
        m(Results, {
          data: vnode.state.data.results,
          executeMapsQuery: () => executeMapsQuery(vnode)
        })
      ])
    ])
  ])
}

m.mount(document.body, App)
