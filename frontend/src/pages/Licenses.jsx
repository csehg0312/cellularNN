import { createComponent } from "solid-js";
import licenses from "../assets/licenses";

function Licenses() {
    return (
        <div class="flex flex-col items-center min-h-screen bg-custom-graphite p-4">
          {Object.keys(licenses).map((licenseKey) => (
            <div 
              key={licenseKey} 
              class="bg-custom-navyBlue shadow-lg rounded-lg p-6 my-4 w-full max-w-lg text-white text-center border-4 border-custom-deepOrange"
            >
              <h2 class="text-xl font-bold mb-2">{licenses[licenseKey].name}</h2>
              <p class="text-blue-500 hover:underline">
                <a href={licenses[licenseKey].link} target="_blank" rel="noopener noreferrer">
                  {licenses[licenseKey].link}
                </a>
              </p>
              <p class="text-white">Created by: {licenses[licenseKey].createdBy}</p>
              <p class="text-white">License: {licenses[licenseKey].license}</p>
              <p class="text-white mt-2">{licenses[licenseKey].description}</p>
            </div>
          ))}
        </div>
    );
}

export default Licenses;
