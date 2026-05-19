import { useEffect, useState } from "react";
import axios from "axios";
import { getSessionToken } from "../utils/session";

function MyPreviewPage() {
  const [domains, setDomains] = useState([]);

  const [batch, setBatch] = useState(null);

  const [loading, setLoading] = useState(true);

  const token = getSessionToken();

  useEffect(() => {
    fetchPreview();
  }, []);

  const fetchPreview = async () => {
    try {
      const response = await axios.get(
        "http://localhost:5000/api/uploader/my-preview",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setDomains(response.data.myDomains);

      setBatch(response.data.batch);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const deleteDomain = async (id) => {
    try {
      await axios.delete(
        `http://localhost:5000/api/uploader/my-domains/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      fetchPreview();
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-6">

      <div className="bg-white rounded-xl shadow-md p-6">

        <h1 className="text-2xl font-bold text-purple-700 mb-6">
          My Draft Preview
        </h1>

        {batch && (
          <div className="mb-6 bg-purple-50 p-4 rounded-lg">

            <p>
              <strong>Batch:</strong>{" "}
              {batch.batchName}
            </p>

            <p>
              <strong>Total Domains:</strong>{" "}
              {batch.totalDomains}
            </p>

            <p>
              <strong>Status:</strong>{" "}
              {batch.status}
            </p>

            <p>
              <strong>Your Domains:</strong>{" "}
              {domains.length}
            </p>

          </div>
        )}

        <div className="overflow-auto border rounded-lg">

          <table className="w-full border-collapse">

            <thead className="bg-purple-100">

              <tr>

                <th className="border p-3 text-left">
                  No
                </th>

                <th className="border p-3 text-left">
                  Domain
                </th>

                <th className="border p-3 text-center">
                  Action
                </th>

              </tr>

            </thead>

            <tbody>

              {domains.map((item, index) => (

                <tr
                  key={item._id}
                  className="hover:bg-gray-50"
                >

                  <td className="border p-3">
                    {index + 1}
                  </td>

                  <td className="border p-3">
                    {item.domain}
                  </td>

                  <td className="border p-3 text-center">

                    <button
                      onClick={() =>
                        deleteDomain(item._id)
                      }
                      className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded"
                    >
                      Delete
                    </button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}

export default MyPreviewPage;
