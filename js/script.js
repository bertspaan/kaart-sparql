var sparqlEndpoint = 'https://data.adamlink.nl/_api/datasets/menno/alles/services/alles/sparql'

var model = {
  results: undefined
}

function updateModel (key, value) {
  var newModel = {}
  newModel[key] = value
  model = Object.assign({}, model, newModel)
  m.redraw()
  return model
}

function getSparqlQuery () {
  return 'PREFIX dc: <http://purl.org/dc/elements/1.1/>\n' +
    'PREFIX dct: <http://purl.org/dc/terms/>\n' +
    'PREFIX geo: <http://www.opengis.net/ont/geosparql#>\n' +
    'PREFIX sem: <http://semanticweb.cs.vu.nl/2009/11/sem/>\n' +
    'PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n' +
    'PREFIX wdt: <http://www.wikidata.org/prop/direct/>\n' +
    '\n' +
    'select ?kaart ?img ?x ?y ?title {\n' +
    '  ?kaart dct:spatial ?spatial .\n' +
    '  ?kaart foaf:depiction ?img .\n' +
    '  ?kaart dc:title ?title .\n' +
    '  ?spatial dc:type "outline"^^xsd:string .\n' +
    '  ?spatial geo:hasGeometry/geo:asWKT ?wktmap .\n' +
    '  ?spatial wdt:P2046 ?km2 .\n' +
    '  bind (bif:st_geomfromtext("POINT(4.89243507385254 52.379790828551016)") as ?x)\n' +
    '  bind (bif:st_geomfromtext(?wktmap) as ?y)\n' +
    '  FILTER (bif:st_intersects(?x, ?y))\n' +
    '}\n' +
    'ORDER BY ASC(?km2)\n' +
    'limit 10'
}

var executeQuery = function (query) {
  var queryString = m.buildQueryString({
    query: getSparqlQuery()
  })

  var formData = new FormData()
  formData.append('query', getSparqlQuery())
  fetch(sparqlEndpoint, {
    method: 'POST',
    body: queryString,
    json: true,
    headers: {
      'Accept': 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    }
  })
    .then(function (response) {
      return response.json()
    }).then(function (json) {
      return updateModel('results', json.results.bindings)
    }).catch(function (err) {
      console.log('parsing failed', err)
    })






  //
  // m.request({
  //   method: 'POST',
  //   url: sparqlEndpoint,
  //   data: formData,
  //   headers: {
  //     //   'content-type': 'application/sparql-results+json'
  //     'accept': 'application/sparql-results+json',
  //
  //   }
  // })
  // .then(function (data) {
  //   console.log(data)
  // })
}

var Form = {
  updateResults: function () {
    console.log('koekjes')
  },
  view: function(vnode) {
    // console.log(vnode)
    return m('li', [
      m('h2', 'Parameters'),
      m('button', {
        onclick: executeQuery
      }, 'Doe het')
    ])
  },
}

var Map = {
  view: function() {
    return m('li', [
      m('h2', 'Map'),
      m('div', {
        id: 'map'
      })
    ])
  },
  oncreate: function (vnode) {
    var map = L.map('map').setView([51.505, -0.09], 13)

    var CartoDB_Positron = L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
	    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
	    subdomains: 'abcd',
	    maxZoom: 19
    }).addTo(map)
  }
}

var Sparql = {
  view: function () {
    return m('li', [
      m('textarea', {
        id: 'sparql-query'
      }, getSparqlQuery())
    ])
  },
  oncreate: function (vnode) {
    var element = document.getElementById('sparql-query')

    var editor = CodeMirror.fromTextArea(element, {
      lineNumbers: true,
      mode: 'sparql'
    })

  }
}

var Results =  {
  view: function (vnode) {
    return m('li', [
      m('ol', console.log(model) || model.results && model.results.map(function (result) {
        return m('li', [
          m('img', {
            src: result.img.value
          })
        ])
      }))
    ])
  }
}

// m('div', {
//   class: "title"
// }, "My first app")
// // <textarea id="sparql-query">
// // </textarea>





// m("button", {
//     onclick: increment
// }, count + " clicks"),

var App = {
  view: function(vnode) {
    return m('main', [
      m('ol', {
        class: 'sections'
      }, [
        m(Form),
        m(Map),
        m(Sparql),
        m(Results)
      ])
    ])
  }
}

m.mount(document.body, App)
