import { createComponent, createSignal } from 'solid-js';
import styles from './Home.module.css';

function Navbar() {
  const [isOpen, setIsOpen] = createSignal(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen());
  };

  return (
    <nav className="py-6 bg-custom-darkGray text-custom-white border border-custom-graphite shadow-sm relative">
      <div className="container mx-auto flex justify-between items-center px-6 md:px-8">
        <a href="/" className="text-xl font-bold text-custom-white">CNN WebApp</a>
        
        <button
          onClick={toggleMenu}
          className="text-custom-white focus:outline-none md:hidden"
          aria-label="Toggle Menu"
        >
          {isOpen() ? "✖" : "☰"}
        </button>
        
        <ul className={`md:flex md:space-x-6 hidden`}> 
          <li>
            <a href="/photocnn" className="block py-2 px-4 md:px-0 text-custom-white hover:text-custom-deepOrange">Photo CNN</a>
          </li>
          <li>
            <a href="/videocnn" className="block py-2 px-4 md:px-0 text-custom-white hover:text-custom-deepOrange">Video CNN</a>
          </li>
          <li>
            <a href="/stx" className="block py-2 px-4 md:px-0 text-custom-white hover:text-custom-deepOrange">Paraméterek létrehozása</a>
          </li>
          <li>
            <a href="/licenses" className="block py-2 px-4 md:px-0 text-custom-white hover:text-custom-deepOrange">Licenses</a>
          </li>
        </ul>
      </div>
      
      {/* Mobil menü */}
      <ul className={`absolute top-full left-0 w-full bg-custom-darkGray p-4 md:hidden transition-all ${isOpen() ? "block" : "hidden"}`}>
        <li>
          <a href="/photocnn" className="block py-2 text-custom-white hover:text-custom-deepOrange">Photo CNN</a>
        </li>
        <li>
          <a href="/videocnn" className="block py-2 text-custom-white hover:text-custom-deepOrange">Video CNN</a>
        </li>
        <li>
          <a href="/stx" className="block py-2 text-custom-white hover:text-custom-deepOrange">Paraméterek létrehozása</a>
        </li>
        <li>
          <a href="/licenses" className="block py-2 text-custom-white hover:text-custom-deepOrange">Licenses</a>
        </li>
      </ul>
    </nav>
  );
}


function Home() {
  return (
    <div className="relative container mx-auto p-6 text-white">
      <Navbar />
      
      <div className="w-screen max-w-full bg-opacity-50 p-4">
        <h1 className="text-3xl font-bold mb-4">Celluláris Neurális Hálózatok és Webalkalmazásunk</h1>
        
        <p className="text-lg mb-6">
          A Chua-Yang-féle celluláris neurális hálózatok (CNN) speciális matematikai modellek,
          amelyek képfeldolgozási és mintázatfelismerési feladatokban kiemelkedően hatékonyak.
          Ezek a hálózatok egy rács szerkezetű sejthálózatként működnek, ahol minden sejt a szomszédaival kommunikál.
        </p>
        
        <p className="text-lg mb-6">
          Az ilyen hálózatok előnye, hogy képesek párhuzamosan nagy mennyiségű adatot feldolgozni,
          miközben a helyi kölcsönhatások révén globális mintázatokat ismernek fel. A Chua-Yang modell
          egyik különlegessége, hogy az analóg és digitális számítások kombinációjával hatékonyan alkalmazható
          különböző képfeldolgozási technikákban, például élkiemelésben, textúraelemzésben és zajcsökkentésben.
        </p>
        
        <h2 className="text-2xl font-bold mb-4">Webalkalmazásunk</h2>
        <p className="text-lg mb-6">
          Webalkalmazásunk lehetőséget biztosít celluláris neurális hálózatok alkalmazására képfeldolgozási feladatokhoz.
          Két fő oldal érhető el: <strong>PhotoCNN</strong> és <strong>Paraméterek létrehozása</strong>.
        </p>
        
        <h2 className="text-xl font-bold mb-3">PhotoCNN</h2>
        <p className="text-lg mb-6">
          Ezen az oldalon feltölthetsz egy képet, kiválaszthatod a kívánt képfeldolgozási módot,
          és a szerver elvégzi a kívánt műveletet. A feldolgozott kép nagyított nézetben is megtekinthető,
          valamint az alkalmazott <strong>visszacsatolási séma</strong>, <strong>kontroll séma</strong> és <strong>időköz</strong> is megjelenik.
          Lehetőség van saját mentett feldolgozási beállítások betöltésére is.
        </p>
        
        <h2 className="text-xl font-bold mb-3">Paraméterek létrehozása</h2>
        <p className="text-lg mb-6">
          Itt saját feldolgozási beállításokat adhatsz meg és mentheted el a szerveren,
          amelyeket később a <strong>PhotoCNN</strong> oldalon használhatsz.
        </p>
      </div>
    </div>
  );
}

export default Home;
