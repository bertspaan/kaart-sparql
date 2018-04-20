const SPARQL_ENDPOINT = 'https://data.adamlink.nl/_api/datasets/menno/alles/services/alles/sparql'
// const SPARQL_ENDPOINT = 'https://data.adamlink.nl/AdamNet/all/services/endpoint'
const SPARQL_HREF = 'https://data.adamlink.nl/AdamNet/all/services/endpoint'

PERIOD_BOUNDS = {
  start: 1600,
  end: (new Date()).getFullYear()
}

function createMapsQuery (data) {
  const round = (num) => Math.round(num * 100000) / 100000

  return `
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX sem: <http://semanticweb.cs.vu.nl/2009/11/sem/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>

SELECT ?map ?img ?x ?y ?title ?begin {
  ?map dct:spatial ?spatial .
  ?map foaf:depiction ?img .
  ?map dc:title ?title .

  ?map sem:hasBeginTimeStamp ?begin .
  FILTER (year(xsd:dateTime(?begin)) >= ${data.period.start}) .
  FILTER (year(xsd:dateTime(?begin)) <= ${data.period.end}) .

  ?spatial dc:type "outline"^^xsd:string .
  ?spatial geo:hasGeometry/geo:asWKT ?wkt .
  ?spatial wdt:P2046 ?km2 .
  bind (bif:st_geomfromtext("POINT(${round(data.coordinates.lng)} ${round(data.coordinates.lat)})") as ?point)
  bind (bif:st_geomfromtext(?wkt) as ?outline)
  FILTER (bif:st_intersects(?point, ?outline))
}
ORDER BY ASC(?km2)
LIMIT 25`.trim()
}

function createCollectionsQuery () {
  return `
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX void: <http://rdfs.org/ns/void#>
SELECT DISTINCT ?provenance ?collection (COUNT(?map) AS ?count) WHERE {
  ?map dc:type "kaart"^^xsd:string .
  ?map void:inDataset ?collection .
  ?map dct:provenance ?provenance .
  ?map dct:spatial ?spatial .
  ?spatial dc:type "outline"^^xsd:string .
}
GROUP BY ?provenance ?collection
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

function createRangeSlider (vnode, min, max, value, oninput) {
  return m('input', {
    type: 'range',
    min,
    max,
    value,
    oninput: (event) => {
      const value = parseInt(event.target.value)
      oninput(value)
    }
  })
}

const CollectionsSelect = {
  collections: undefined,
  view: (vnode) => m('select', {
    multiple: 'multiple'
  }, vnode.state.collections && vnode.state.collections.map((collection) =>
    m('option', `${collection.provenance.value} (${collection.count.value} kaarten)`)
  )),
  oncreate: (vnode) => {
    const query = createCollectionsQuery()
    executeQuery(query)
      .then((collections) => {
        Object.assign(vnode.state, {collections})
        m.redraw()
      })
  }
}

const GeoIntersects = {
  view: (vnode) => m('div', {
    id: 'map-container'
  }, [
    m(Map, {
      moveEnd: vnode.attrs.coordinatesUpdated
    })
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
      m(CollectionsSelect),
      createRangeSlider(vnode, PERIOD_BOUNDS.start, PERIOD_BOUNDS.end, vnode.attrs.data.period.start, (value) => {
        vnode.attrs.data.period.start = value
        if (vnode.attrs.data.period.end < value) {
          vnode.attrs.data.period.end = value
        }
        vnode.attrs.formUpdated(vnode.attrs.data)
      }),
      createRangeSlider(vnode, PERIOD_BOUNDS.start, PERIOD_BOUNDS.end, vnode.attrs.data.period.end, (value) => {
        vnode.attrs.data.period.end = value
        if (vnode.attrs.data.period.start > value) {
          vnode.attrs.data.period.start = value
        }
        vnode.attrs.formUpdated(vnode.attrs.data)
      }),
      m(GeoIntersects, {
        coordinatesUpdated: (coordinates) => {
          vnode.attrs.data.coordinates = {
            lat: coordinates.lat,
            lng: coordinates.lng
          }
          vnode.attrs.formUpdated(vnode.attrs.data)
          m.redraw()
        }
      }),
      m('button', {
        type: 'submit'
      }, 'Voer query uit op SPARQL-endpoint')
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
    m('div', [
      m('a', {
        href: `${SPARQL_HREF}#query=${encodeURIComponent(createMapsQuery(vnode.attrs.data))}&` +
        `contentTypeConstruct=text%2Fturtle&contentTypeSelect=application%2Fsparql-results%2Bjson&` +
        `endpoint=${encodeURIComponent(SPARQL_ENDPOINT)}&requestMethod=POST&tabTitle=Query&` +
        `headers=%7B%7D&outputFormat=table`
      }, 'Open query in AdamLink')
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

function renderResults (data) {
  if (data && data.length) {
    return m('ol', {
      id: 'results'
    }, data.map((result) => m('li', [
      m('h3', {
        class: 'truncate',
        title: result.title.value
      }, result.title.value),
      m('a', {
        href: result.map.value
      }, [
        m('img', {
          src: result.img.value
        })
      ])
    ])))
  } else {
    return m('p', 'Geen resultaten')
  }
}

const Results =  {
  view: (vnode) => m('li', [
    m('h2', 'Resultaten'),
    renderResults(vnode.attrs.data)
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
      }
    }
  },
  view: (vnode) => ([
    m('header', 'Kaarten uit Adamlink met SPARQL'),
    m('main', [
      m('p', 'Hier komt de introductie! En het wordt ook nog mooier dan dit natuurlijk.'),
      m('ol', {
        class: 'sections'
      }, [
        m(Form, {
          data: vnode.state.data.form,
          formUpdated: (form) => Object.assign(vnode.state.data, form),
          executeMapsQuery: () => executeMapsQuery(vnode)
        }),
        m(Sparql, {
          data: vnode.state.data.form
        }),
        m(Results, {
          data: vnode.state.data.results
        })
      ])
    ])
  ])
}

m.mount(document.body, App)
