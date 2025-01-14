import { createSignal, createEffect, For } from "solid-js";
import { useNavigate } from "@solidjs/router";

const STX = () => {
    const navigate = useNavigate();
    const [radius, setRadius] = createSignal(0);
    const [table, setTable] = createSignal([]);
    const [inputs, setInputs] = createSignal({});

    let radiusRef;
    let formRef;
    let ctrltableRef;
    let fdbtableRef;

    const handleSubmit = async () => {
        const ctrlInputs = Array.from(
            ctrltableRef.querySelectorAll("input.ctrlIN"),
        );
        const fdbInputs = Array.from(
            fdbtableRef.querySelectorAll("input.fdbIN"),
        );
        const ctrlVals = ctrlInputs.map((input) =>
            input.value === "" ? "0.0" : input.value,
        );
        const fdbVals = fdbInputs.map((input) =>
            input.value === "" ? "0.0" : input.value,
        );
        const initialVal = document.getElementById("initialVal");
        const biasVal = document.getElementById("biasVal");
        const tspanVal = document.getElementById("tspanVal");
        const stepsVal = document.getElementById("stepsVal");
        const dataToSend = {
            radius: radiusRef.value,
            ctrl: ctrlVals,
            fdb: fdbVals,
            bias: biasVal.value.trim(),
            tspan: tspanVal.value,
            initial:initialVal.value,
            steps:stepsVal.value
        };

        console.log(dataToSend);

        try {
            const response = await fetch("/stx", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(dataToSend),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data) {
                console.log(data);
                navigate("/", { replace: true });
            } else {
                console.error("No connection");
            }
        }
        catch (error) {
            console.error("Error sending data:", error);
        }
    };

    const updateRadius = (newRadius) => {
        setRadius(parseInt(newRadius) || 0);
    };

    createEffect(() => {
        const r = radius();
        const size = 2 * r + 1;
        const newTable = Array(size)
            .fill()
            .map((_, i) =>
                Array(size)
                    .fill()
                    .map((_, j) => {
                        const x = j - r;
                        const y = i - r;
                        return {
                            value: "",
                            inRadius: Math.abs(x) + Math.abs(y) <= r,
                        };
                    }),
            );
        setTable(newTable);
    });

    return (
        <div class="container mx-auto p-4">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Radius:
                    <input
                        ref={radiusRef}
                        type="number"
                        min="0"
                        max="3"
                        id="radiusIN"
                        value={radius()}
                        onInput={(e) => updateRadius(e.target.value)}
                        class="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                </label>
            </div>
            <form id="submitTemplates" ref={formRef} class="space-y-8">
                <div>
                    <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">Control Template</h3>
                    <div class="overflow-x-auto">
                        <table ref={ctrltableRef} class="min-w-full table-auto border-collapse">
                            <tbody>
                                <For each={table()}>
                                    {(row, i) => (
                                        <tr>
                                            <For each={row}>
                                                {(cell, j) => (
                                                    <td class="p-2 border">
                                                        <input
                                                            value={cell.value}
                                                            placeholder="0"
                                                            step="0.1"
                                                            type="number"
                                                            class="ctrlIN w-full p-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                                            style={{
                                                                "background-color": cell.inRadius
                                                                    ? "lightblue"
                                                                    : "white",
                                                            }}
                                                            onInput={(e) => {
                                                                const newTable = [...table()];
                                                                newTable[i()][j()].value = e.target.value;
                                                                setTable(newTable);
                                                            }}
                                                        />
                                                    </td>
                                                )}
                                            </For>
                                        </tr>
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                </div>
    
                <div>
                    <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">Feedback Template</h3>
                    <div class="overflow-x-auto">
                        <table ref={fdbtableRef} class="min-w-full table-auto border-collapse">
                            <tbody>
                                <For each={table()}>
                                    {(row, i) => (
                                        <tr>
                                            <For each={row}>
                                                {(cell, j) => (
                                                    <td class="p-2 border">
                                                        <input
                                                            value={cell.value}
                                                            placeholder="0"
                                                            step="0.1"
                                                            type="number"
                                                            class="fdbIN w-full p-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                                            style={{
                                                                "background-color": cell.inRadius
                                                                    ? "lightblue"
                                                                    : "white",
                                                            }}
                                                            onInput={(e) => {
                                                                const newTable = [...table()];
                                                                newTable[i()][j()].value = e.target.value;
                                                                setTable(newTable);
                                                            }}
                                                        />
                                                    </td>
                                                )}
                                            </For>
                                        </tr>
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">Kezdeti állapot (Tizedes szám)</h3>
                    <div class="overflow-x-auto">
                        <input id="initialVal" class="w-full p-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" 
                        type="number" 
                        // value={0.0}
                        step="0.1" 
                        placeholder="0.0" 
                        required/>
                    </div>
                </div>
                <div>
                    <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">Biasz változó (Tizedes szám)</h3>
                    <div class="overflow-x-auto">
                        <input id="biasVal" class="w-full p-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" 
                        type="number" 
                        // value={0.0}
                        step="0.1" 
                        placeholder="0.0" 
                        required/>
                    </div>
                </div>

                <div>
                    <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">Idősík (x-tengelyen)</h3>
                    <div class="overflow-x-auto">
                        <label for="linspace" class="text-md font-medium leading-6 text-black">Az idősík 0-20 között:</label>
                        <input class="linspace w-full p-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" 
                        type="range" 
                        id="tspanVal"
                        // value={0.0}
                        min="0"
                        max="20"
                        oninput="document.getElementById('rangeValue').innerText = '0-' + this.value" 
                        required/>
                        <span id="rangeValue" class="text-sm text-gray-900 dark:text-gray-100">0-20</span>
                    </div>
                    <div class="overflow-x-auto">
                        <h4 class="text-md font-medium leading-6 text-black" >Lépések száma (Egész szám):</h4>
                        <input class="w-full p-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" 
                        type="number" 
                        id="stepsVal"
                        // value={0.0}
                        step="0.1" 
                        placeholder="1" 
                        required/>
                    </div>
                    
                </div>
    
                <button
                    type="button"
                    id="sendSubmit"
                    onClick={handleSubmit}
                    class="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    Send to server
                </button>
            </form>
    
            <div class="mt-4">
                <a
                    href="/"
                    class="text-indigo-600 hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-500"
                >
                    Back
                </a>
            </div>
        </div>
    );
    
};

export default STX;
