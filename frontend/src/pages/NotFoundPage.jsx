import { Link } from "react-router-dom";

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">
          Error 404
        </p>


        <p className="mt-3 text-slate-500">
          The page you are looking for does not exist.
        </p>

        <Link
          to="/today"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Back to Today
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;

// import { Link } from "react-router-dom";

// function NotFoundPage() { 
//   return (
//     <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
//       <div className="text-center">
//         <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">
//           Error 404
//         </p>  
//         </div>
//         </div>
//   )
// };
// export default NotFoundPage;