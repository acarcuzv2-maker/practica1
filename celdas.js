const $ = el => document.querySelector(el)
const $$ = el => document.querySelectorAll(el)

const $table = $('table')
const $head = $('thead')
const $body = $('tbody')

const COLUMNAS = 10
const FILAS = 15
const FIRST_CHAR_CODE=65

    
const range = length => Array.from({length } , (_, i) => i)
const obtenerColumna= i => String.fromCharCode(FIRST_CHAR_CODE + i)
    

const CLAVE_STORAGE = 'hoja-de-calculo'

function estadoVacio() {

    return range(COLUMNAS).map(i => range(FILAS).map(j => ({ computedValue: 0, value: 0 })))
}

    
function cargarEstado() {
     try {
        const guardado = localStorage.getItem(CLAVE_STORAGE)
        if (!guardado) return estadoVacio()

        const datos = JSON.parse(guardado)

        const valido = Array.isArray(datos) &&
            datos.length === COLUMNAS &&
            datos.every(col => Array.isArray(col) && col.length === FILAS)

        return valido ? datos : estadoVacio()
    } catch (e) {
         return estadoVacio()
    }
}

function guardarEstado() {
    try {
        localStorage.setItem(CLAVE_STORAGE, JSON.stringify(STATE))
    } catch (e) {
        console.error('No se pudo guardar:', e)
    }
}

let STATE = cargarEstado()


const MAX_HISTORIAL = 100
let DESHACER = []
let REHACER = []

    
function registrarCambio() {
    DESHACER.push(STATE)
    if (DESHACER.length > MAX_HISTORIAL) DESHACER.shift()
    REHACER = [] 
}

function deshacer() {
    if (!DESHACER.length) return
    REHACER.push(STATE)
    STATE = DESHACER.pop()
    guardarEstado()
    renderSpreadSheet()
}

function rehacer() {
    if (!REHACER.length) return
    DESHACER.push(STATE)
    STATE = REHACER.pop()
    guardarEstado()
     renderSpreadSheet()
}

function actualizarbotoness() {
     $('#btn-deshacer').disabled = DESHACER.length === 0
    $('#btn-rehacer').disabled = REHACER.length === 0
}
        
console.log(STATE)



const aplanaar = args => args.flat(Infinity)
const numbers = args => aplanaar(args).filter(v => typeof v === 'number' && !isNaN(v))

const SUM = (...args) => numbers(args).reduce((a, b) => a + b, 0)
const AVERAGE = (...args) => {
    const n = numbers(args)
    return n.length ? SUM(n) / n.length : 0
}
const MIN = (...args) => { const n = numbers(args); return n.length ? Math.min(...n) : 0 }
const MAX = (...args) => { const n = numbers(args); return n.length ? Math.max(...n) : 0 }
const SUMA = SUM
const PROMEDIO = AVERAGE

function updateCell({ x, y, value }){
    const newState= structuredClone(STATE)

    const constants= generateCellsContants(newState)

    const cell = newState[x][y]

    cell.computedValue = computeValue(value, constants)      
     cell.value = value

    newState[x][y] = cell

    computeAllCells(newState)

    registrarCambio()
    STATE = newState
    guardarEstado()
    renderSpreadSheet()
        
}

function generateCellsContants (cells){
    return cells.map((filas, x)=>{
        return filas.map((cell, y)=>{
             const letra = obtenerColumna(x)
            const cellId= `${letra}${y + 1}`
            return `const ${cellId} = ${JSON.stringify(cell.computedValue)};`

        }).join('\n')
    }).join('\n')
}

function obtenerDependencias(value) {
    if (typeof value !== 'string' || !value.startsWith('=')) return []
    const formula = expandRanges(value.slice(1).toUpperCase())
    return formula.match(/[A-Z]+\d+/g) || []
}

function construirGrafo(cells) {
    const grafo = {}
    cells.forEach((filas, x) => {
        filas.forEach((cell, y) => {
            const id = `${obtenerColumna(x)}${y + 1}`
            grafo[id] = obtenerDependencias(cell.value)
        })
    })
    return grafo
}

function celdasCirculares(grafo) {
    const circulares = new Set()

    for (const inicio in grafo) {
        const visitados = new Set()
        const pila = [...grafo[inicio]]

        while (pila.length) {
            const actual = pila.pop()
            if (actual === inicio) {       // volvimos al punto de partida: hay ciclo
                circulares.add(inicio)
                break
            }
            if (visitados.has(actual) || !(actual in grafo)) continue
            visitados.add(actual)
            pila.push(...grafo[actual])
        }
    }
    return circulares
}
function computeAllCells(cells) {
    const circulares = celdasCirculares(construirGrafo(cells))
    const maxPasadas = FILAS * COLUMNAS
    let cambio = true
    let pasadas = 0

    while (cambio && pasadas < maxPasadas) {
        cambio = false
        pasadas++

        const constants = generateCellsContants(cells)

        cells.forEach((filas, x) => {
            filas.forEach((cell, y) => {
                const id = `${obtenerColumna(x)}${y + 1}`
                const nuevo = circulares.has(id)
                    ? '#CIRCULAR!'
                    : computeValue(cell.value, constants)

                if (nuevo !== cell.computedValue) {
                    cell.computedValue = nuevo
                    cambio = true
                }
            })
        })
    }
}

function expandRanges(formula) {
   
    return formula.replace(/([A-Z])(\d+):([A-Z])(\d+)/g, (_, c1, r1, c2, r2) => {
        const cols = [c1.charCodeAt(0), c2.charCodeAt(0)].sort((a, b) => a - b)
        const rows = [+r1, +r2].sort((a, b) => a - b)
        const cells = []
        for (let c = cols[0]; c <= cols[1]; c++) {
            for (let r = rows[0]; r <= rows[1]; r++) {
                cells.push(String.fromCharCode(c) + r)
            }
        }
        return `[${cells.join(',')}]`
    })
}

const ERRORES = ['#DIV/0!', '#FORMULA!', '#NOMBRE?', '#REF!', '#CIRCULAR!']
function computeValue(value, constants){
    if (typeof value === 'number') return value
    if (!value.startsWith('=')) {
        return value.trim() !== '' && !isNaN(value) ? Number(value) : value
    }

    const formula = expandRanges(value.slice(1).toUpperCase()).trim()

    if (formula === '') return '#FORMULA!'

    try {
        const result = eval(`(() => {
            ${constants}
            return ${formula};
        })()`)

        if (result === undefined) return '#FORMULA!'

        if (typeof result === 'number' && !isFinite(result)) return '#DIV/0!'

        if (typeof result === 'string') {
            const error = ERRORES.find(e => result.includes(e))
            if (error) return error
        }

        return result
    } catch(e) {
        if (e instanceof SyntaxError) return '#FORMULA!'

        if (e instanceof ReferenceError) {
            const nombre = e.message.split(' ')[0]
            return /^[A-Z]+\d+$/.test(nombre) ? '#REF!' : '#NOMBRE?'
        }

        return '#ERROR!'
    }
}

function claseCelda(valor) {
    if (typeof valor === 'number' && valor < 0) return 'negativo'
    if (String(valor).startsWith('#')) return 'error'
    return ''
}

const renderSpreadSheet = () => {
    const headerHTML = `<tr>
        <th></th>
        ${range(COLUMNAS).map(i => `<th>${obtenerColumna(i)}</th>`).join('')}
        </tr>`

        $head.innerHTML = headerHTML   
        const bodyHTML = range (FILAS).map(fila =>{
            return `<tr>
            <td>${fila + 1 }</td>
            ${range(COLUMNAS).map(columna => `
            <td data-x="${columna}" data-y="${fila}">
            <span class="${claseCelda(STATE[columna][fila].computedValue)}">${STATE[columna][fila].computedValue}</span>               
            <input type= "text" value="${STATE[columna][fila].value}"/>
            </td>    
            `).join('')}
   
            </tr>`

        }).join('')

    $body.innerHTML = bodyHTML
    actualizarbotoness()
}

$body.addEventListener('click', event=> {

    const td= event.target.closest ('td')
    if (!td) return

    const { x, y } = td.dataset
    const input= td.querySelector('input')
    const span= td.querySelector('span')

    const end= input.value.length
    input.setSelectionRange(end, end)
    input.focus()

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter')input.blur()
    })

    input.addEventListener('blur', () => {
        console.log({ value: input.value, state: STATE[x][y].value })
    
        if (input.value === STATE [x][y].value) return

    updateCell({ x, y, value: input.value })
    }, { once: true })
})

function escaparCSV(valor) {
    const texto = String(valor)
    if (/[",\n\r;]/.test(texto)) {
        return '"' + texto.replace(/"/g, '""') + '"'
    }
    return texto
}
function exportarCSV() {
    const filas = range(FILAS).map(fila =>
        range(COLUMNAS)
            .map(columna => escaparCSV(STATE[columna][fila].value === 0 ? '' : STATE[columna][fila].value))
            .join(',')
    )

    const csv = '\uFEFF' + filas.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = 'hoja-de-calculo.csv'
    enlace.click()

    URL.revokeObjectURL(url)
}

$('#btn-csv').addEventListener('click', exportarCSV)


$('#btn-borrar').addEventListener('click', () => {
    registrarCambio()
    STATE = estadoVacio()
    try {
        localStorage.removeItem(CLAVE_STORAGE)
    } catch (e) {}
    renderSpreadSheet()
})

$('#btn-deshacer').addEventListener('click', deshacer)
$('#btn-rehacer').addEventListener('click', rehacer)

document.addEventListener('keydown', e => {
    if (document.activeElement.tagName === 'INPUT') return

    if (!(e.ctrlKey || e.metaKey)) return
    
    const tecla = e.key.toLowerCase()

    if (tecla === 'z' && !e.shiftKey) {
            e.preventDefault()
            deshacer()
    } else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) {
            e.preventDefault()
            rehacer()
    }
})

computeAllCells(STATE)
renderSpreadSheet()